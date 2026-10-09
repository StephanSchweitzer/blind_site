import { NextResponse } from 'next/server';
import { BillingStatus, BillKind, OrderBillingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { attachableOrderWhere, orderAttachBlock, FORCEABLE_BLOCKS } from '@/lib/billing';
import { STATUS } from '@/lib/statusSync';
import { buildOrderSearchWhere } from '@/lib/search';
import { normalizeSearchQuery, parseEntityId } from '@/lib/search-query';

/** Demandes non rattachables montrées sous les autres — voir plus bas. */
const UNAVAILABLE_LIMIT = 10;

const ORDER_SELECT = {
    id: true,
    requestReceivedDate: true,
    cost: true,
    billingStatus: true,
    billId: true,
    pages: true,
    statusId: true,
    status: { select: { name: true } },
    isDuplication: true,
    catalogue: { select: { title: true, author: true } },
    bill: { select: { id: true, state: true, kind: true } },
} satisfies Prisma.OrdersSelect;

type Row = Prisma.OrdersGetPayload<{ select: typeof ORDER_SELECT }>;

/**
 * Les demandes d'un auditeur, vues depuis une facture : celles qu'on peut y
 * rattacher (`orders`), puis celles qu'on ne peut pas, avec la raison
 * (`unavailable`).
 *
 * Sert le formulaire « Créer une nouvelle facture » et « Ajouter une demande »
 * d'un brouillon (`billId`, dont la demande ne se propose pas à elle-même et
 * dont le type — standard ou pro-forma — décide de ce qui s'y rattache). Sans
 * `billId`, le type n'est pas encore décidé : revues et demandes au poids sont
 * toutes rattachables, et `pagePriced` permet au formulaire de griser les unes
 * dès qu'on coche l'autre (une revue se facture seule). La règle
 * est orderAttachBlock, la même que POST /api/bills et l'action addOrder : la
 * liste ne peut plus proposer ce que le serveur refuse.
 *
 * Pourquoi rendre aussi les autres : la liste ne montrait que les rattachables,
 * et un auditeur dont la seule demande était une revue (tarifée à la page, donc
 * sur sa propre pro-forma) affichait « Aucune demande facturable » — lu comme
 * « il faut qu'elle soit Terminé ». Une demande écartée dit maintenant pourquoi,
 * et sur quelle facture elle se trouve déjà.
 *
 * Les rattachables sont toutes rendues (une poignée par auditeur). Les autres
 * non : un auditeur en a jusqu'à plusieurs milliers sur d'anciennes factures.
 * On en rend UNAVAILABLE_LIMIT, les plus utiles d'abord — celles qui attendent
 * leur clôture, puis celles des factures en cours (brouillon, émise), les « Non
 * facturable », enfin celles des factures réglées — et `unavailableTotal` pour
 * dire qu'il en reste. `search` filtre les deux listes ; une recherche par numéro
 * place cette demande en tête, où qu'elle soit.
 *
 * Le coût reste null quand il l'est : « pas de tarif » et « 0 € » ne sont pas la
 * même information, et c'est ici qu'un permanent peut encore s'en apercevoir.
 */
export const GET = withAdmin(async (request) => {
    try {
        const params = request.nextUrl.searchParams;
        const clientId = parseInt(params.get('clientId') ?? '');
        if (!clientId || isNaN(clientId)) {
            return NextResponse.json(
                { error: 'Missing clientId', message: 'Le paramètre clientId est requis' },
                { status: 400 }
            );
        }

        let billKind: BillKind | null = null;
        let currentBillId: number | null = null;
        let proformaFull = false;
        const billIdParam = params.get('billId');
        if (billIdParam) {
            const bill = await prisma.bill.findUnique({
                where: { id: parseInt(billIdParam) || 0 },
                select: { id: true, kind: true, clientId: true, isActive: true },
            });
            if (!bill || !bill.isActive || bill.clientId !== clientId) {
                return NextResponse.json(
                    { error: 'Invalid billId', message: 'Facture introuvable pour cet auditeur' },
                    { status: 400 }
                );
            }
            billKind = bill.kind;
            currentBillId = bill.id;
            // Une pro-forma porte une seule revue (orderAttachBlock, PROFORMA_FULL).
            proformaFull =
                bill.kind === BillKind.PROFORMA &&
                (await prisma.orders.count({ where: { billId: bill.id, isActive: true } })) > 0;
        }

        const search = normalizeSearchQuery(params.get('search') || '');
        const searchClauses = search ? buildOrderSearchWhere(search) : null;
        const base: Prisma.OrdersWhereInput = {
            aveugleId: clientId,
            isActive: true,
            ...(searchClauses ? { AND: searchClauses } : {}),
        };
        // Une demande déjà sur CETTE facture est listée au-dessus, dans ses lignes.
        const notThisBill: Prisma.OrdersWhereInput =
            currentBillId != null ? { billId: { not: currentBillId } } : {};

        const unavailableGroups: Prisma.OrdersWhereInput[] = [
            // Rattachables partout ailleurs, mais cette pro-forma a déjà sa revue.
            ...(proformaFull ? [attachableOrderWhere(billKind)] : []),
            // Pas encore close : pas expédiée, ou tarifée autrement que la facture.
            {
                billId: null,
                billingStatus: { not: OrderBillingStatus.UNBILLABLE },
                OR: [
                    { statusId: { in: [STATUS.ATTENTE, STATUS.EN_COURS, STATUS.ATTENTE_AUDITEUR] } },
                    ...(billKind != null ? [{ pages: billKind === BillKind.PROFORMA ? null : { not: null } }] : []),
                ],
            },
            { ...notThisBill, bill: { state: { in: [BillingStatus.DRAFT, BillingStatus.BILLED] } } },
            { billId: null, billingStatus: OrderBillingStatus.UNBILLABLE },
            { ...notThisBill, bill: { state: { in: [BillingStatus.PAID, BillingStatus.SOLDE] } } },
        ].map((group) => ({ AND: [base, group] }));

        const orderBy = { requestReceivedDate: 'desc' } as const;
        const [attachable, groups, counts] = await Promise.all([
            proformaFull
                ? Promise.resolve([] as Row[])
                : prisma.orders.findMany({
                      where: { AND: [base, attachableOrderWhere(billKind)] },
                      orderBy,
                      select: ORDER_SELECT,
                  }),
            Promise.all(
                unavailableGroups.map((where) =>
                    prisma.orders.findMany({ where, orderBy, take: UNAVAILABLE_LIMIT, select: ORDER_SELECT })
                )
            ),
            Promise.all(unavailableGroups.map((where) => prisma.orders.count({ where }))),
        ]);

        let unavailable = groups.flat().slice(0, UNAVAILABLE_LIMIT);
        let orders = attachable;

        // Le numéro tapé mène à SA demande, même tombée au-delà de la limite.
        const entityId = search ? parseEntityId(search) : null;
        if (entityId !== null && !orders.some((o) => o.id === entityId)) {
            const exact =
                unavailable.find((o) => o.id === entityId) ??
                (await prisma.orders.findFirst({ where: { AND: [base, { id: entityId }] }, select: ORDER_SELECT }));
            if (exact && (currentBillId == null || exact.billId !== currentBillId)) {
                if (orderAttachBlock(exact, billKind, { proformaFull }) === null) {
                    orders = [exact, ...orders];
                } else {
                    unavailable = [exact, ...unavailable.filter((o) => o.id !== entityId)].slice(0, UNAVAILABLE_LIMIT);
                }
            }
        }

        const common = (o: Row) => ({
            id: o.id,
            requestReceivedDate: o.requestReceivedDate.toISOString(),
            statusId: o.statusId,
            statusName: o.status?.name ?? null,
            isDuplication: o.isDuplication,
            pagePriced: o.pages != null,
            catalogue: o.catalogue,
        });

        return NextResponse.json({
            orders: orders.map((o) => ({
                ...common(o),
                cost: o.cost != null ? Number(o.cost) : null,
                billingStatus: o.billingStatus,
            })),
            unavailable: unavailable.map((o) => {
                // Jamais null ici : chaque groupe ci-dessus est un cas de orderAttachBlock.
                const reason = orderAttachBlock(o, billKind, { proformaFull })!;
                // Forçable : un blocage de déroulé, ET un tarif — voir guardForcedOrderPriced.
                // La raison d'un forçage sans tarif est donnée dans l'interface (cost null).
                // Une pro-forma pleine reste pleine, forcée ou non.
                const forceable =
                    FORCEABLE_BLOCKS.includes(reason) &&
                    orderAttachBlock(o, billKind, { proformaFull, force: true }) === null;
                return {
                    ...common(o),
                    cost: o.cost != null ? Number(o.cost) : null,
                    reason,
                    forceable,
                    bill: o.bill,
                };
            }),
            unavailableTotal: counts.reduce((sum, n) => sum + n, 0),
        });
    } catch (error) {
        console.error('Error fetching eligible orders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch eligible orders', message: 'Erreur lors de la récupération des demandes' },
            { status: 500 }
        );
    }
});
