import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { Prisma, BillingStatus, OrderBillingStatus } from '@prisma/client';
import {
    recomputeBillTotal,
    logBillEvent,
    orderBillingForBillState,
    paymentPrecedesIssue,
} from '@/lib/billing';
import { buildBillSearchWhere } from '@/lib/search';
import { billsTableInclude } from '@/types/models/bill.model';
import { withAdmin } from '@/lib/auth/guards';

const LATE_THRESHOLD_DAYS = 30;

export const GET = withAdmin(async (request) => {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const search = searchParams.get('search') || '';
        const rawStatus = searchParams.get('status');
        const late = searchParams.get('late') === 'true';
        const rawClientId = searchParams.get('clientId');
        const rawLimit = searchParams.get('limit');

        const billsPerPage = rawLimit ? Math.max(1, parseInt(rawLimit)) : 10;

        // Hide soft-deleted bills from the listing.
        const whereClause: Prisma.BillWhereInput = { isActive: true };

        // One definition, shared with the /admin/bills page — see
        // buildBillSearchWhere.
        if (search) {
            const tokenClauses = buildBillSearchWhere(search);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (rawClientId) {
            const parsedClientId = parseInt(rawClientId);
            if (!isNaN(parsedClientId)) whereClause.clientId = parsedClientId;
        }

        if (late) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - LATE_THRESHOLD_DAYS);
            whereClause.state = BillingStatus.BILLED;
            whereClause.issueDate = { lt: thirtyDaysAgo };
        } else if (rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)) {
            whereClause.state = rawStatus as BillingStatus;
        }

        const [bills, totalBills] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: Math.max(0, (page - 1) * billsPerPage),
                take: billsPerPage,
                include: billsTableInclude,
            }),
            prisma.bill.count({ where: whereClause }),
        ]);

        const serializedBills = bills.map((bill) => ({
            ...bill,
            creationDate: bill.creationDate.toISOString(),
            issueDate: bill.issueDate?.toISOString() ?? null,
            paymentDate: bill.paymentDate?.toISOString() ?? null,
            invoiceAmount: bill.invoiceAmount.toString(),
        }));

        return NextResponse.json({
            bills: serializedBills,
            totalBills,
            totalPages: Math.ceil(totalBills / billsPerPage),
        });
    } catch (error) {
        console.error('Error fetching bills:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bills', message: 'Erreur lors de la récupération des factures' },
            { status: 500 }
        );
    }
});

/**
 * POST /api/bills - Manually create a facture for a client, attaching a set of
 * already-existing, not-yet-billed demandes to it (see AddBillFormBackend / the
 * "eligible orders" list at GET /api/bills/eligible-orders). This is a separate path
 * from the automatic accrual in lib/billing.ts (accrueOrderToOpenDraft): here the
 * admin picks the client, the orders, and the bill's state/dates directly.
 */
export const POST = withAdmin(async (request, { me }) => {
    revalidateAdmin();
    try {
        const performedById = me.id;
        const body = await request.json();
        const { clientId, orderIds, state, creationDate, issueDate, paymentReference, paymentDate } = body;

        const parsedClientId = parseInt(String(clientId));
        if (!clientId || isNaN(parsedClientId)) {
            return NextResponse.json(
                { error: 'Missing clientId', message: 'Veuillez sélectionner un auditeur' },
                { status: 400 }
            );
        }

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return NextResponse.json(
                { error: 'Missing orderIds', message: 'Veuillez sélectionner au moins une demande à facturer' },
                { status: 400 }
            );
        }
        const parsedOrderIds = orderIds.map((id) => parseInt(String(id)));
        if (parsedOrderIds.some((id) => isNaN(id))) {
            return NextResponse.json(
                { error: 'Invalid orderIds', message: 'Un ou plusieurs identifiants de demande sont invalides' },
                { status: 400 }
            );
        }

        // Une facture ne NAÎT que brouillon ou émise.
        //
        // « Payée » et « Soldée » sont des états qu'on ATTEINT : updateStatus exige
        // une référence de paiement pour PAID et n'y mène que depuis BILLED. Les
        // accepter ici créait une facture payée sans trace de paiement, sur une
        // transition que la machine à états refuse partout ailleurs.
        const CREATABLE_STATES: BillingStatus[] = [BillingStatus.DRAFT, BillingStatus.BILLED];
        const finalState: BillingStatus = state || BillingStatus.BILLED;
        if (!CREATABLE_STATES.includes(finalState)) {
            return NextResponse.json(
                {
                    error: 'Invalid state',
                    message:
                        'Une facture ne peut être créée qu\'en « Brouillon » ou « Émise ». ' +
                        'Une facture se marque payée ou soldée depuis sa fiche, une fois émise.',
                },
                { status: 400 }
            );
        }

        let parsedCreationDate: Date;
        try {
            parsedCreationDate = creationDate ? new Date(creationDate) : new Date();
            if (isNaN(parsedCreationDate.getTime())) throw new Error('Invalid date');
        } catch {
            return NextResponse.json(
                { error: 'Invalid creationDate', message: 'La date de création est invalide', field: 'creationDate' },
                { status: 400 }
            );
        }

        let parsedIssueDate: Date | null = null;
        if (issueDate) {
            parsedIssueDate = new Date(issueDate);
            if (isNaN(parsedIssueDate.getTime())) {
                return NextResponse.json(
                    { error: 'Invalid issueDate', message: 'La date d\'émission est invalide', field: 'issueDate' },
                    { status: 400 }
                );
            }
        }

        // Une facture peut NAÎTRE déjà encaissée — mais pas naître « payée » tout court.
        //
        // L'invariant posé plus haut n'est pas « PAID interdit à la création », c'est
        // « une facture payée porte toujours une référence de paiement, et un passé
        // d'émission ». Un permanent qui saisit après coup une facture déjà réglée peut
        // donc le faire en un seul geste, à condition de fournir de quoi tenir cet
        // invariant : la facture est créée ÉMISE, puis encaissée dans la même
        // transaction, et le journal porte les deux événements — exactement ce
        // qu'auraient écrit les deux étapes séparées.
        const wantsSettled = paymentReference != null || paymentDate != null;
        const trimmedReference = typeof paymentReference === 'string' ? paymentReference.trim() : '';
        let parsedPaymentDate: Date | null = null;

        if (wantsSettled) {
            if (finalState !== BillingStatus.BILLED) {
                return NextResponse.json(
                    {
                        error: 'Invalid settled state',
                        message: 'Seule une facture émise peut être enregistrée comme déjà réglée ; un brouillon n\'a pas été envoyé.',
                    },
                    { status: 400 }
                );
            }
            if (!trimmedReference) {
                return NextResponse.json(
                    {
                        error: 'Payment reference required',
                        message: 'Un identifiant de paiement est requis pour marquer une facture comme payée',
                        field: 'paymentReference',
                    },
                    { status: 400 }
                );
            }
            // Payée mais jamais émise est la contradiction même que ce chemin doit éviter.
            if (!parsedIssueDate) {
                return NextResponse.json(
                    {
                        error: 'Issue date required',
                        message: 'Une facture déjà réglée doit porter sa date d\'émission',
                        field: 'issueDate',
                    },
                    { status: 400 }
                );
            }
            if (!paymentDate) {
                return NextResponse.json(
                    { error: 'Payment date required', message: 'La date de paiement est requise', field: 'paymentDate' },
                    { status: 400 }
                );
            }
            parsedPaymentDate = new Date(paymentDate);
            if (isNaN(parsedPaymentDate.getTime())) {
                return NextResponse.json(
                    { error: 'Invalid paymentDate', message: 'La date de paiement est invalide', field: 'paymentDate' },
                    { status: 400 }
                );
            }
            if (paymentPrecedesIssue(parsedPaymentDate, parsedIssueDate)) {
                return NextResponse.json(
                    {
                        error: 'Payment before issue',
                        message: 'La date de paiement ne peut pas précéder la date d\'émission',
                        field: 'paymentDate',
                    },
                    { status: 400 }
                );
            }
        }

        const client = await prisma.user.findUnique({ where: { id: parsedClientId }, select: { id: true } });
        if (!client) {
            return NextResponse.json({ error: 'Client not found', message: 'Auditeur introuvable' }, { status: 404 });
        }

        const billId = await prisma.$transaction(async (tx) => {
            // Les demandes sont validées ET totalisées AVANT l'insertion, pour que la
            // facture naisse avec son vrai montant.
            //
            // invoiceAmount est un DERIVED_FIELD (lib/audit/config.ts) : tout write qui
            // ne déplace que lui est retiré du journal des modifications. Une facture
            // créée à 0 puis recalculée à 6 € y reste donc « Montant de la facture : 0 »
            // pour toujours — la correction, elle, est jetée. La seule ligne que le
            // journal verra jamais est celle de la création, et c'est pourquoi elle doit
            // déjà porter le bon chiffre.
            const orders: { id: number; cost: Prisma.Decimal | null }[] = [];
            for (const orderId of parsedOrderIds) {
                const order = await tx.orders.findUnique({
                    where: { id: orderId },
                    select: {
                        id: true,
                        aveugleId: true,
                        billId: true,
                        billingStatus: true,
                        isActive: true,
                        cost: true,
                    },
                });
                if (!order || !order.isActive) throw new Error('ORDER_NOT_FOUND');
                if (order.aveugleId !== parsedClientId) throw new Error('CLIENT_MISMATCH');
                if (order.billId !== null) throw new Error('ORDER_ALREADY_BILLED');
                if (order.billingStatus === OrderBillingStatus.UNBILLABLE) throw new Error('ORDER_UNBILLABLE');
                orders.push({ id: order.id, cost: order.cost });
            }
            // Même arithmétique que recomputeBillTotal, faite plus tôt parce que la
            // ligne n'existe pas encore ; l'appel ci-dessous reste l'autorité.
            const initialTotal = orders.reduce(
                (sum, o) => sum.plus(o.cost ?? new Prisma.Decimal(0)),
                new Prisma.Decimal(0)
            );

            // PLUSIEURS BROUILLONS OUVERTS PAR AUDITEUR SONT NORMAUX.
            //
            // Cette création est toujours une VRAIE création, brouillon compris :
            // un permanent qui ouvre une facture pour un auditeur en ouvre une
            // nouvelle, même si cet auditeur en a déjà une en cours. C'est une
            // demande explicite de l'équipe — un même auditeur peut avoir
            // plusieurs brouillons ouverts en parallèle.
            //
            // Ne PAS router ce chemin vers getOrCreateOpenDraft. Sa description
            // (« the single grouping point … so a client never ends up with
            // parallel open drafts ») décrit l'ACCRUAL automatique, qui doit bien
            // regrouper dans un seul brouillon ; elle ne décrit pas la création
            // manuelle, où le permanent choisit lui-même ce qu'il ouvre.
            const bill = await tx.bill.create({
                data: {
                    clientId: parsedClientId,
                    state: finalState,
                    creationDate: parsedCreationDate,
                    issueDate: parsedIssueDate,
                    // Le montant à la création, et pas 0 corrigé ensuite :
                    // invoiceAmount est un DERIVED_FIELD, donc un write qui ne
                    // déplace que lui est retiré du journal. La seule ligne que
                    // le journal verra jamais est celle de la création.
                    invoiceAmount: initialTotal,
                    isActive: true,
                },
                select: { id: true },
            });

            await logBillEvent(tx, {
                billId: bill.id,
                type: 'CREATED',
                toState: finalState,
                performedById,
            });

            // Pas de total courant par demande ici, contrairement à un rattachement
            // ultérieur (PUT /api/bills/[id], accrueOrderToOpenDraft) : cette création
            // est un seul geste atomique, il n'existe aucun instant où la facture n'a
            // porté que la première de ses demandes. Chaque événement porte donc le
            // même montant, celui de la facture telle qu'elle a été créée.
            for (const order of orders) {
                await tx.orders.update({
                    where: { id: order.id },
                    data: { billId: bill.id, billingStatus: orderBillingForBillState(finalState) },
                });
            }

            // recomputeBillTotal reste la source de vérité de la colonne : il confirme
            // le total contre ce qui est réellement rattaché. Sans effet dans le cas
            // normal, et invisible au journal de toute façon (champ dérivé).
            //
            // AVANT les événements, pas après : logBillEvent relit invoiceAmount pour
            // en tamponner amountAtEvent, et sur un brouillon RÉUTILISÉ la colonne
            // porte encore le total d'avant ce rattachement. C'est aussi l'ordre que
            // suit accrueOrderToOpenDraft.
            await recomputeBillTotal(tx, bill.id);

            for (const order of orders) {
                await logBillEvent(tx, {
                    billId: bill.id,
                    type: 'ORDER_ATTACHED',
                    payload: { orderId: order.id },
                    performedById,
                });
            }

            // L'encaissement : le second geste, dans la même transaction que le premier.
            //
            // APRÈS le rattachement et recomputeBillTotal, pour que l'amountAtEvent de
            // l'événement PAID porte le vrai total de la facture et non le montant
            // d'une facture encore vide. Les demandes, elles, ne bougent pas :
            // orderBillingForBillState rend « BILLED » pour PAID comme pour BILLED,
            // et elles viennent d'être posées à cette valeur juste au-dessus.
            if (wantsSettled) {
                await tx.bill.update({
                    where: { id: bill.id },
                    data: {
                        state: BillingStatus.PAID,
                        paymentDate: parsedPaymentDate,
                        paymentReference: trimmedReference,
                    },
                });
                await logBillEvent(tx, {
                    billId: bill.id,
                    type: 'PAID',
                    fromState: BillingStatus.BILLED,
                    toState: BillingStatus.PAID,
                    payload: { paymentReference: trimmedReference },
                    performedById,
                });
            }

            return bill.id;
        });

        return NextResponse.json(
            {
                bill: { id: billId },
                message: wantsSettled
                    ? 'Facture créée et enregistrée comme payée'
                    : 'Facture créée avec succès',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating bill:', error);

        const msg = error instanceof Error ? error.message : '';
        const errorMap: Record<string, [string, number]> = {
            ORDER_NOT_FOUND: ['Une des demandes sélectionnées est introuvable', 404],
            CLIENT_MISMATCH: ['Une des demandes sélectionnées n\'appartient pas à cet auditeur', 400],
            ORDER_ALREADY_BILLED: ['Une des demandes sélectionnées est déjà rattachée à une facture', 400],
            ORDER_UNBILLABLE: ['Une des demandes sélectionnées est marquée non-facturable', 400],
        };
        if (errorMap[msg]) {
            return NextResponse.json({ error: msg, message: errorMap[msg][0] }, { status: errorMap[msg][1] });
        }

        return NextResponse.json(
            { error: 'Failed to create bill', message: 'Une erreur inattendue est survenue', details: msg || undefined },
            { status: 500 }
        );
    }
});
