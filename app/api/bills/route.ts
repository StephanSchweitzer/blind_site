import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BillingStatus, Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BillCreateInputSchema } from '@/types/api/bill.api';

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

export async function GET(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const searchParams = request.nextUrl.searchParams;

        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')));
        const searchTerm = searchParams.get('search') || '';
        const clientId = searchParams.get('clientId') ? parseInt(searchParams.get('clientId')!) : undefined;
        const showLate = searchParams.get('late') === 'true';
        // Soft-deleted bills are hidden by default; pass ?includeInactive=true to include them.
        const includeInactive = searchParams.get('includeInactive') === 'true';

        const rawStatus = searchParams.get('status');
        const status = rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)
            ? (rawStatus as BillingStatus)
            : undefined;

        const whereClause: Prisma.BillWhereInput = {};

        if (!includeInactive) {
            whereClause.isActive = true;
        }

        if (searchTerm) {
            whereClause.client = {
                OR: [
                    { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                    { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                ],
            };
        }

        if (showLate) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            whereClause.state = BillingStatus.BILLED;
            whereClause.issueDate = { lt: thirtyDaysAgo };
        } else if (status) {
            whereClause.state = status;
        }

        if (clientId) {
            whereClause.clientId = clientId;
        }

        const [bills, totalBills] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    client: {
                        select: { id: true, name: true, email: true },
                    },
                    orders: {
                        select: { id: true },
                    },
                },
            }),
            prisma.bill.count({ where: whereClause }),
        ]);

        const serializedBills = bills.map(bill => ({
            ...bill,
            creationDate: bill.creationDate.toISOString(),
            issueDate: bill.issueDate?.toISOString() ?? null,
            paymentDate: bill.paymentDate?.toISOString() ?? null,
            invoiceAmount: bill.invoiceAmount.toString(),
        }));

        return NextResponse.json({
            success: true,
            data: {
                bills: serializedBills,
                pagination: {
                    page,
                    limit,
                    totalBills,
                    totalPages: Math.ceil(totalBills / limit),
                    hasMore: page * limit < totalBills,
                },
            },
        });
    } catch (error) {
        console.error('Error fetching bills:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch bills',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

// POST: create a facture by attaching a client's unbilled orders.
// The amount is derived server-side from the attached orders (single source of truth),
// and the orders are linked + flipped to BILLED in the same transaction.
export async function POST(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const body = await request.json();
        const parsed = BillCreateInputSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Validation error', message: 'Données invalides', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const { clientId, orderIds, state, creationDate, issueDate, paymentDate } = parsed.data;

        const bill = await prisma.$transaction(async (tx) => {
            // Re-validate inside the transaction: orders must belong to the client,
            // be active, and not already attached to a bill. Prevents racing two
            // bills onto the same orders.
            const orders = await tx.orders.findMany({
                where: {
                    id: { in: orderIds },
                    aveugleId: clientId,
                    billId: null,
                    isActive: true,
                    billingStatus: { not: 'UNBILLABLE' },
                },
                select: { id: true, cost: true },
            });

            if (orders.length !== orderIds.length) {
                throw new Prisma.PrismaClientKnownRequestError(
                    'Some orders are not eligible (already billed, wrong client, or unbillable)',
                    { code: 'P2025', clientVersion: 'app' }
                );
            }

            const invoiceAmount = orders.reduce(
                (sum, o) => sum.plus(o.cost ?? new Prisma.Decimal(0)),
                new Prisma.Decimal(0)
            );

            const created = await tx.bill.create({
                data: {
                    clientId,
                    state: state ?? BillingStatus.BILLED,
                    creationDate: creationDate ? new Date(creationDate) : new Date(),
                    issueDate: issueDate ? new Date(issueDate) : null,
                    paymentDate: paymentDate ? new Date(paymentDate) : null,
                    invoiceAmount,
                    isActive: true,
                },
                include: { client: { select: { id: true, name: true, email: true } } },
            });

            await tx.orders.updateMany({
                where: { id: { in: orderIds } },
                data: { billId: created.id, billingStatus: orderBillingForBillState(created.state) },
            });

            return created;
        });

        return NextResponse.json(
            {
                success: true,
                bill: {
                    ...bill,
                    creationDate: bill.creationDate.toISOString(),
                    issueDate: bill.issueDate?.toISOString() ?? null,
                    paymentDate: bill.paymentDate?.toISOString() ?? null,
                    invoiceAmount: bill.invoiceAmount.toString(),
                },
                message: 'Facture créée avec succès',
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating bill:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') {
                return NextResponse.json(
                    { success: false, error: 'Ineligible orders', message: 'Certaines demandes ne sont pas éligibles (déjà facturées, mauvais client, ou non facturables).' },
                    { status: 409 }
                );
            }
            if (error.code === 'P2003') {
                return NextResponse.json(
                    { success: false, error: 'Foreign key constraint failed', message: 'Le client est invalide.', code: error.code },
                    { status: 400 }
                );
            }
            return NextResponse.json(
                { success: false, error: 'Database error', message: `Erreur de base de données: ${error.code}`, code: error.code },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to create bill',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}