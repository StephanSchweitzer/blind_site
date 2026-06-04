import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { BillingStatus, Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')));
        const searchTerm = searchParams.get('search') || '';
        const clientId = searchParams.get('clientId') ? parseInt(searchParams.get('clientId')!) : undefined;
        const showLate = searchParams.get('late') === 'true';

        const rawStatus = searchParams.get('status');
        const status = rawStatus && Object.values(BillingStatus).includes(rawStatus as BillingStatus)
            ? (rawStatus as BillingStatus)
            : undefined;

        const whereClause: Prisma.BillWhereInput = {};

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

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { clientId, state, creationDate, issueDate, paymentDate, invoiceAmount } = body;

        if (!clientId || !state || !creationDate || !invoiceAmount) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields',
                    message: 'clientId, state, creationDate, and invoiceAmount are required',
                },
                { status: 400 }
            );
        }

        if (!Object.values(BillingStatus).includes(state)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid state',
                    message: `state must be one of: ${Object.values(BillingStatus).join(', ')}`,
                },
                { status: 400 }
            );
        }

        const bill = await prisma.bill.create({
            data: {
                clientId: parseInt(clientId),
                state: state as BillingStatus,
                creationDate: new Date(creationDate),
                issueDate: issueDate ? new Date(issueDate) : null,
                paymentDate: paymentDate ? new Date(paymentDate) : null,
                invoiceAmount: parseFloat(invoiceAmount),
            },
            include: {
                client: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        return NextResponse.json({
            success: true,
            data: {
                ...bill,
                creationDate: bill.creationDate.toISOString(),
                issueDate: bill.issueDate?.toISOString() ?? null,
                paymentDate: bill.paymentDate?.toISOString() ?? null,
                invoiceAmount: bill.invoiceAmount.toString(),
            },
            message: 'Bill created successfully',
        });
    } catch (error) {
        console.error('Error creating bill:', error);
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