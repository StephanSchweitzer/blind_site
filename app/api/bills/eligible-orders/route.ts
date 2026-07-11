import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

// Returns the orders that are eligible to be attached to a new facture for a client:
// belong to the client, not already on a bill (billId null), not UNBILLABLE, and active.
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
                catalogue: {
                    select: { title: true, author: true },
                },
            },
        });

        // Serialize Decimal/Date for the client
        const serialized = orders.map(o => ({
            id: o.id,
            requestReceivedDate: o.requestReceivedDate.toISOString(),
            cost: o.cost ? Number(o.cost) : 0,
            billingStatus: o.billingStatus,
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