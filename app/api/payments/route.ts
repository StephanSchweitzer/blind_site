import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { PaymentType, PaymentMethod, Prisma } from '@prisma/client';
import { PaymentCreateInputSchema } from '@/types/api/payment.api';
import { withAdmin } from '@/lib/auth/guards';
import { buildUserNameSearch } from '@/lib/search';
import { parsePageParam, parseLimitParam, pageSkip } from '@/lib/pagination';

const clientSelect = { id: true, name: true, firstName: true, lastName: true, email: true };
const billSelect = { id: true, invoiceAmount: true, state: true, creationDate: true };

export const GET = withAdmin(async (request) => {
    try {
        const sp = request.nextUrl.searchParams;

        const page = parsePageParam(sp.get('page'));
        const limit = parseLimitParam(sp.get('limit'), 10);
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
            // Tokenized across firstName / lastName / name / email — same as the
            // /admin/payments page, so both entry points match the same clients.
            const clientSearch = buildUserNameSearch(searchTerm);
            if (clientSearch) whereClause.client = clientSearch;
        }

        const [payments, totalPayments] = await Promise.all([
            prisma.payment.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: pageSkip(page, limit),
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
            bill: p.bill ? { ...p.bill, invoiceAmount: p.bill.invoiceAmount.toString(), creationDate: p.bill.creationDate.toISOString() } : null,
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
});

// POST: create a payment. The amount is supplied directly (unlike bills, which
// derive it from orders). A billId is only persisted for ENREGISTREMENT and a
// cotisationYear only for COTISATION; both are validated/coerced server-side.
export const POST = withAdmin(async (request) => {
    revalidateAdmin();
    try {
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
                    bill: payment.bill ? { ...payment.bill, invoiceAmount: payment.bill.invoiceAmount.toString(), creationDate: payment.bill.creationDate.toISOString() } : null,
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
});