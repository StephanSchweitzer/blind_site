import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

/**
 * Les demandes rattachables à une nouvelle facture pour un auditeur : les
 * siennes, sur aucune facture (billId null), non « Non facturable », actives.
 *
 * Renvoie AUSSI le statut de chacune et son coût tel quel — y compris null.
 *
 * C'est l'écran où un permanent choisit ce qu'il facture, et il ne montrait ni
 * l'un ni l'autre : un coût jamais renseigné arrivait ici en `0`, donc affiché
 * « 0,00 € » comme s'il avait été décidé, alors que la facture imprime « — »
 * pour cette ligne et que recomputeBillTotal la compte pour zéro. Et rien ne
 * disait qu'une demande n'était pas encore « Terminé », alors que toute la
 * chaîne d'accrual automatique existe précisément pour ne facturer qu'une
 * prestation rendue (voir accrueOrderToOpenDraft).
 *
 * La route ne REFUSE rien de plus qu'avant : facturer à la main une demande en
 * cours reste possible, c'est parfois le geste juste. Elle rend seulement la
 * décision visible, au lieu de la laisser se prendre toute seule.
 */
export const GET = withAdmin(async (request) => {
    try {
        const clientIdParam = request.nextUrl.searchParams.get('clientId');
        const clientId = clientIdParam ? parseInt(clientIdParam) : NaN;

        if (!clientId || isNaN(clientId)) {
            return NextResponse.json(
                { error: 'Missing clientId', message: 'Le paramètre clientId est requis' },
                { status: 400 }
            );
        }

        const orders = await prisma.orders.findMany({
            where: {
                aveugleId: clientId,
                billId: null,
                isActive: true,
                billingStatus: { not: 'UNBILLABLE' },
            },
            orderBy: { requestReceivedDate: 'desc' },
            select: {
                id: true,
                requestReceivedDate: true,
                cost: true,
                billingStatus: true,
                statusId: true,
                status: { select: { name: true } },
                isDuplication: true,
                catalogue: {
                    select: { title: true, author: true },
                },
            },
        });

        // Serialize Decimal/Date for the client. `cost` reste null quand il l'est :
        // « pas de tarif » et « 0 € » ne sont pas la même information, et c'est ici
        // qu'un permanent peut encore s'en apercevoir.
        const serialized = orders.map(o => ({
            id: o.id,
            requestReceivedDate: o.requestReceivedDate.toISOString(),
            cost: o.cost != null ? Number(o.cost) : null,
            billingStatus: o.billingStatus,
            statusId: o.statusId,
            statusName: o.status?.name ?? null,
            isDuplication: o.isDuplication,
            catalogue: o.catalogue,
        }));

        return NextResponse.json({ orders: serialized });
    } catch (error) {
        console.error('Error fetching eligible orders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch eligible orders', message: 'Erreur lors de la récupération des demandes' },
            { status: 500 }
        );
    }
});