import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        // Parse query parameters
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')));
        const searchTerm = searchParams.get('search') || '';
        const stateId = searchParams.get('stateId') ? parseInt(searchParams.get('stateId')!) : undefined;
        const clientId = searchParams.get('clientId') ? parseInt(searchParams.get('clientId')!) : undefined;

        // Build where clause
        const whereClause: Prisma.BillWhereInput = {};

        // Search filter (by client name or email)
        if (searchTerm) {
            whereClause.client = {
                OR: [
                    {
                        name: {
                            contains: searchTerm,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                    {
                        email: {
                            contains: searchTerm,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    },
                ],
            };
        }

        // State filter
        if (stateId) {
            whereClause.stateId = stateId;
        }

        // Client filter
        if (clientId) {
            whereClause.clientId = clientId;
        }

        // Fetch bills and total count
        const [bills, totalBills] = await Promise.all([
            prisma.bill.findMany({
                where: whereClause,
                orderBy: { creationDate: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    client: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    state: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    orders: {
                        select: {
                            id: true,
                        },
                    },
                },
            }),
            prisma.bill.count({ where: whereClause }),
        ]);

        // Serialize data
        const serializedBills = bills.map(bill => ({
            ...bill,
            creationDate: bill.creationDate.toISOString(),
            issueDate: bill.issueDate ? bill.issueDate.toISOString() : null,
            paymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : null,
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

// POST endpoint to create a new bill
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { clientId, stateId, creationDate, issueDate, paymentDate, invoiceAmount } = body;

        // Validate required fields
        if (!clientId || !stateId || !creationDate || !invoiceAmount) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields',
                    message: 'clientId, stateId, creationDate, and invoiceAmount are required',
                },
                { status: 400 }
            );
        }

        // Create bill
        const bill = await prisma.bill.create({
            data: {
                clientId: parseInt(clientId),
                stateId: parseInt(stateId),
                creationDate: new Date(creationDate),
                issueDate: issueDate ? new Date(issueDate) : null,
                paymentDate: paymentDate ? new Date(paymentDate) : null,
                invoiceAmount: parseFloat(invoiceAmount),
            },
            include: {
                client: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                state: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        // Serialize response
        const serializedBill = {
            ...bill,
            creationDate: bill.creationDate.toISOString(),
            issueDate: bill.issueDate ? bill.issueDate.toISOString() : null,
            paymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : null,
            invoiceAmount: bill.invoiceAmount.toString(),
        };

        return NextResponse.json({
            success: true,
            data: serializedBill,
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