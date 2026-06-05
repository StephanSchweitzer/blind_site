import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function checkAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { authorized: false, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
    }
    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return { authorized: false, response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 403 }) };
    }
    return { authorized: true, session };
}

// Returns the orders that are eligible to be attached to a new facture for a client:
// belong to the client, not already on a bill (billId null), not UNBILLABLE, and active.
export async function GET(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

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
}