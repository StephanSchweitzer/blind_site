// app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const search = searchParams.get('search') || '';
        const filter = searchParams.get('filter') || 'all';
        const statusId = searchParams.get('statusId');
        const billingStatus = searchParams.get('billingStatus');

        const ordersPerPage = 10;

        let whereClause: Prisma.OrdersWhereInput = {};

        // Search filter
        if (search) {
            whereClause.OR = [
                {
                    aveugle: {
                        OR: [
                            {
                                name: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                            {
                                email: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                        ],
                    },
                },
                {
                    catalogue: {
                        OR: [
                            {
                                title: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                            {
                                author: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                        ],
                    },
                },
            ];
        }

        // Special filters
        if (filter === 'needsReturn') {
            whereClause.AND = [
                ...(whereClause.AND || []),
                { lentPhysicalBook: true },
                { closureDate: null },
            ];
        } else if (filter === 'late') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            whereClause.AND = [
                ...(whereClause.AND || []),
                { requestReceivedDate: { lt: thirtyDaysAgo } },
                { closureDate: null },
            ];
        }

        // Status filter
        if (statusId && statusId !== 'all') {
            whereClause.statusId = parseInt(statusId);
        }

        // Billing status filter
        if (billingStatus && billingStatus !== 'all') {
            whereClause.billingStatus = billingStatus as any;
        }

        const [orders, totalOrders] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                orderBy: { requestReceivedDate: 'desc' },
                skip: Math.max(0, (page - 1) * ordersPerPage),
                take: ordersPerPage,
                include: {
                    aveugle: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                    status: {
                        select: {
                            name: true,
                        },
                    },
                    mediaFormat: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma.orders.count({ where: whereClause }),
        ]);

        return NextResponse.json({
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}