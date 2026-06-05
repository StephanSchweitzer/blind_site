import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PaymentCreateInputSchema } from '@/types/api/payment.api';

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

const clientSelect = { id: true, name: true, firstName: true, lastName: true, email: true };
const billSelect = { id: true, invoiceAmount: true, state: true };

export async function GET(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) return authCheck.response;

        const sp = request.nextUrl.searchParams;

        const page = Math.max(1, parseInt(sp.get('page') || '1'));
        const limit = Math.max(1, Math.min(100, parseInt(sp.get('limit') || '10')));
        const searchTerm = sp.get('search') || '';
        const clientId = sp.get('clientId') ? parseInt(sp.get('clientId')!) : undefined;
        const includeInactive = sp.get('includeInactive') === 'true';

        const rawType = sp.get('type');
        const type = rawType && Object.values(PaymentType).includes(rawType as PaymentType)
            ? (rawType as PaymentType)
            : undefined;

        const rawMethod = sp.get('paymentMethod');
        const paymentMethod = rawMethod && Object.values(PaymentMethod).includes(rawMethod as PaymentMethod)
            ? (rawMethod as PaymentMethod)
            : undefined;

        const whereClause: Prisma.PaymentWhereInput = {};

        if (!includeInactive) whereClause.isActive = true;
        if (type) whereClause.type = type;
        if (paymentMethod) whereClause.paymentMethod = paymentMethod;
        if (clientId) whereClause.clientId = clientId;

        if (searchTerm) {
            whereClause.client = {
                OR: [
                    { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                    { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                ],
            };
        }

        const [payments, totalPayments] = await Promise.all([
            prisma.payment.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: { client: { select: clientSelect }, bill: { select: billSelect } },
            }),
            prisma.payment.count({ where: whereClause }),
        ]);

        const serialized = payments.map((p) => ({
            ...p,
            amount: p.amount.toString(),
            creationDate: p.creationDate.toISOString(),
            issueDate: p.issueDate?.toISOString() ?? null,
            paymentDate: p.paymentDate?.toISOString() ?? null,
            exportDate: p.exportDate?.toISOString() ?? null,
            importDate: p.importDate?.toISOString() ?? null,
            allocationDate: p.allocationDate?.toISOString() ?? null,
            bill: p.bill ? { ...p.bill, invoiceAmount: p.bill.invoiceAmount.toString() } : null,
        }));

        return NextResponse.json({
            success: true,
            data: {
                payments: serialized,
                pagination: {
                    page,
                    limit,
                    totalPayments,
                    totalPages: Math.ceil(totalPayments / limit),
                    hasMore: page * limit < totalPayments,
                },
            },
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch payments', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// POST: create a payment. The amount is supplied directly (unlike bills, which
// derive it from orders). A billId is only persisted for ENREGISTREMENT and a
// cotisationYear only for COTISATION; both are validated/coerced server-side.
export async function POST(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) return authCheck.response;

        const body = await request.json();
        const parsed = PaymentCreateInputSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Validation error', message: 'Données invalides', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const d = parsed.data;
        const billId = d.type === PaymentType.ENREGISTREMENT ? (d.billId ?? null) : null;
        const cotisationYear = d.type === PaymentType.COTISATION ? (d.cotisationYear ?? null) : null;

        const data: Prisma.PaymentUncheckedCreateInput = {
            clientId: d.clientId ?? null,
            type: d.type,
            amount: new Prisma.Decimal(d.amount),
            paymentMethod: d.paymentMethod ?? null,
            creationDate: d.creationDate ? new Date(d.creationDate) : new Date(),
            issueDate: d.issueDate ? new Date(d.issueDate) : null,
            paymentDate: d.paymentDate ? new Date(d.paymentDate) : null,
            allocationDate: d.allocationDate ? new Date(d.allocationDate) : null,
            receiptNumber: d.receiptNumber ?? null,
            fiscalite: d.fiscalite ?? null,
            cotisationYear,
            comptable: d.comptable ?? null,
            isAllocated: d.isAllocated ?? null,
            observations: d.observations ?? null,
            billId,
            isActive: true,
        };

        const payment = await prisma.$transaction(async (tx) => {
            if (billId != null) {
                const bill = await tx.bill.findUnique({
                    where: { id: billId, isActive: true },
                    select: { id: true, clientId: true },
                });
                if (!bill) {
                    throw new Prisma.PrismaClientKnownRequestError('Bill not found', { code: 'P2025', clientVersion: 'app' });
                }
                if (d.clientId != null && bill.clientId !== d.clientId) {
                    throw new Error('BILL_CLIENT_MISMATCH');
                }
            }
            return tx.payment.create({
                data,
                include: { client: { select: clientSelect }, bill: { select: billSelect } },
            });
        });

        return NextResponse.json(
            {
                success: true,
                payment: {
                    ...payment,
                    amount: payment.amount.toString(),
                    creationDate: payment.creationDate.toISOString(),
                    issueDate: payment.issueDate?.toISOString() ?? null,
                    paymentDate: payment.paymentDate?.toISOString() ?? null,
                    exportDate: payment.exportDate?.toISOString() ?? null,
                    importDate: payment.importDate?.toISOString() ?? null,
                    allocationDate: payment.allocationDate?.toISOString() ?? null,
                    bill: payment.bill ? { ...payment.bill, invoiceAmount: payment.bill.invoiceAmount.toString() } : null,
                },
                message: 'Paiement créé avec succès',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating payment:', error);

        const msg = error instanceof Error ? error.message : '';
        if (msg === 'BILL_CLIENT_MISMATCH') {
            return NextResponse.json(
                { success: false, error: msg, message: 'La facture liée n’appartient pas au client sélectionné.' },
                { status: 400 }
            );
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                return NextResponse.json(
                    { success: false, error: 'Bill not found', message: 'La facture liée est introuvable ou inactive.' },
                    { status: 409 }
                );
            }
            if (error.code === 'P2003') {
                return NextResponse.json(
                    { success: false, error: 'Foreign key constraint failed', message: 'Le client ou la facture est invalide.', code: error.code },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { success: false, error: 'Database error', message: `Erreur de base de données: ${error.code}`, code: error.code },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { success: false, error: 'Failed to create payment', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}