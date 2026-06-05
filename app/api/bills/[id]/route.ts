import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const { id } = await context.params;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const bill = await prisma.bill.findUnique({
            where: { id: billId },
            include: {
                client: { select: { id: true, name: true, email: true } },
                orders: {
                    select: {
                        id: true,
                        requestReceivedDate: true,
                        cost: true,
                        billingStatus: true,
                        catalogue: { select: { title: true, author: true } },
                    },
                    orderBy: { requestReceivedDate: 'desc' },
                },
            },
        });

        if (!bill) {
            return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
        }

        return NextResponse.json({ bill });
    } catch (error) {
        console.error('Error fetching bill:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bill', message: 'Erreur lors de la récupération de la facture' },
            { status: 500 }
        );
    }
}

// Soft delete: mark the bill inactive AND unlink its orders (reset billId + billingStatus).
export async function DELETE(_request: NextRequest, context: RouteContext) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const { id } = await context.params;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            const existing = await tx.bill.findUnique({ where: { id: billId }, select: { id: true } });
            if (!existing) {
                throw new Prisma.PrismaClientKnownRequestError('Bill not found', { code: 'P2025', clientVersion: 'app' });
            }

            // Detach orders and revert their order-level billing status.
            await tx.orders.updateMany({
                where: { billId },
                data: { billId: null, billingStatus: 'UNBILLED' },
            });

            await tx.bill.update({
                where: { id: billId },
                data: { isActive: false, deletedAt: new Date() },
            });
        });

        return NextResponse.json({ message: 'Facture supprimée avec succès' });
    } catch (error) {
        console.error('Error deleting bill:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
        }

        return NextResponse.json(
            { error: 'Failed to delete bill', message: 'Une erreur inattendue est survenue', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}