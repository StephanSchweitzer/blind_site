import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// An order is BILLED once its bill is issued (anything past DRAFT); a draft (brouillon) leaves it UNBILLED.
const orderBillingForBillState = (state: string): 'BILLED' | 'UNBILLED' =>
    state === 'DRAFT' ? 'UNBILLED' : 'BILLED';

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

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) return authCheck.response;

        const { id } = await context.params;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const body = await request.json();
        const { action } = body;

        if (action === 'updateStatus') {
            const { state, paymentReference } = body;

            const validStates = ['DRAFT', 'BILLED', 'PAID', 'SOLDE'];
            if (!validStates.includes(state)) {
                return NextResponse.json({ error: 'Invalid state', message: 'Statut invalide' }, { status: 400 });
            }

            if (state === 'PAID' && !paymentReference?.trim()) {
                return NextResponse.json(
                    { error: 'Payment reference required', message: 'Un identifiant de paiement est requis pour marquer une facture comme payée' },
                    { status: 400 }
                );
            }

            const bill = await prisma.bill.findUnique({
                where: { id: billId, isActive: true },
                select: { id: true, state: true },
            });
            if (!bill) {
                return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
            }

            const transitions: Record<string, string[]> = {
                DRAFT: ['BILLED'],
                BILLED: ['DRAFT', 'PAID'],
                PAID: ['SOLDE'],
                SOLDE: [],
            };
            if (!transitions[bill.state]?.includes(state)) {
                return NextResponse.json(
                    { error: 'Invalid transition', message: `Transition de ${bill.state} vers ${state} non autorisée` },
                    { status: 400 }
                );
            }

            const updateData: Record<string, unknown> = { state };
            if (state === 'BILLED') updateData.issueDate = new Date();
            if (state === 'DRAFT') updateData.issueDate = null;
            if (state === 'PAID') {
                updateData.paymentDate = new Date();
                updateData.paymentReference = paymentReference.trim(); // Add paymentReference String? to your Bill model
            }

            await prisma.$transaction(async (tx) => {
                await tx.bill.update({ where: { id: billId }, data: updateData });
                // Keep attached orders' billingStatus in sync with the bill's state.
                await tx.orders.updateMany({
                    where: { billId },
                    data: { billingStatus: orderBillingForBillState(state) },
                });
            });
            return NextResponse.json({ message: 'Statut mis à jour avec succès' });
        }

        if (action === 'addOrder') {
            const { orderId } = body;
            if (!orderId || isNaN(parseInt(orderId))) {
                return NextResponse.json({ error: 'Invalid orderId', message: 'Identifiant de demande invalide' }, { status: 400 });
            }

            await prisma.$transaction(async (tx) => {
                const bill = await tx.bill.findUnique({
                    where: { id: billId, isActive: true },
                    select: { state: true, clientId: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (bill.state !== 'DRAFT') throw new Error('BILL_NOT_DRAFT');

                const order = await tx.orders.findUnique({
                    where: { id: parseInt(orderId) },
                    select: { aveugleId: true, billId: true },
                });
                if (!order) throw new Error('ORDER_NOT_FOUND');
                if (order.billId !== null) throw new Error('ORDER_ALREADY_BILLED');
                if (order.aveugleId !== bill.clientId) throw new Error('CLIENT_MISMATCH');

                await tx.orders.update({
                    where: { id: parseInt(orderId) },
                    data: { billId, billingStatus: orderBillingForBillState(bill.state) },
                });

                const linked = await tx.orders.findMany({ where: { billId }, select: { cost: true } });
                const total = linked.reduce((sum, o) => sum + (o.cost ? parseFloat(o.cost.toString()) : 0), 0);
                await tx.bill.update({ where: { id: billId }, data: { invoiceAmount: new Prisma.Decimal(total) } });
            });

            return NextResponse.json({ message: 'Demande ajoutée à la facture' });
        }

        if (action === 'removeOrder') {
            const { orderId } = body;
            if (!orderId || isNaN(parseInt(orderId))) {
                return NextResponse.json({ error: 'Invalid orderId', message: 'Identifiant de demande invalide' }, { status: 400 });
            }

            await prisma.$transaction(async (tx) => {
                const bill = await tx.bill.findUnique({
                    where: { id: billId, isActive: true },
                    select: { state: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (bill.state !== 'DRAFT') throw new Error('BILL_NOT_DRAFT');

                await tx.orders.update({
                    where: { id: parseInt(orderId), billId },
                    data: { billId: null, billingStatus: 'UNBILLED' },
                });

                const linked = await tx.orders.findMany({ where: { billId }, select: { cost: true } });
                const total = linked.reduce((sum, o) => sum + (o.cost ? parseFloat(o.cost.toString()) : 0), 0);
                await tx.bill.update({ where: { id: billId }, data: { invoiceAmount: new Prisma.Decimal(total) } });
            });

            return NextResponse.json({ message: 'Demande retirée de la facture' });
        }

        if (action === 'updatePaymentReference') {
            const { paymentReference } = body;
            const trimmed = paymentReference?.trim() || null;
            const bill = await prisma.bill.findUnique({ where: { id: billId, isActive: true }, select: { id: true, state: true } });
            if (!bill) return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });

            const autoPay = trimmed && bill.state === 'DRAFT';
            await prisma.$transaction(async (tx) => {
                await tx.bill.update({
                    where: { id: billId },
                    data: {
                        paymentReference: trimmed,
                        ...(autoPay ? { state: 'PAID', issueDate: new Date(), paymentDate: new Date() } : {}),
                    },
                });
                // Auto-pay issues the bill, so its orders become BILLED.
                if (autoPay) {
                    await tx.orders.updateMany({ where: { billId }, data: { billingStatus: 'BILLED' } });
                }
            });
            return NextResponse.json({
                message: autoPay
                    ? 'Référence enregistrée — facture marquée comme payée'
                    : 'Référence de paiement mise à jour',
            });
        }

        return NextResponse.json({ error: 'Unknown action', message: 'Action inconnue' }, { status: 400 });
    } catch (error) {
        console.error('Error patching bill:', error);

        const msg = error instanceof Error ? error.message : '';
        const errorMap: Record<string, [string, number]> = {
            BILL_NOT_FOUND: ['Facture introuvable', 404],
            ORDER_NOT_FOUND: ['Demande introuvable', 404],
            BILL_NOT_DRAFT: ['La facture doit être en brouillon pour modifier ses demandes', 400],
            ORDER_ALREADY_BILLED: ['Cette demande est déjà rattachée à une facture', 400],
            CLIENT_MISMATCH: ['Cette demande n\'appartient pas au client de cette facture', 400],
        };
        if (errorMap[msg]) {
            return NextResponse.json({ error: msg, message: errorMap[msg][0] }, { status: errorMap[msg][1] });
        }

        return NextResponse.json(
            { error: 'Failed to update bill', message: 'Une erreur inattendue est survenue' },
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