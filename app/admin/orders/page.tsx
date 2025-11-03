// app/admin/orders/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import OrdersTable from './orders-table';
import { notFound } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getOrders(
    page: number,
    searchTerm: string,
    filter: string = 'all',
    statusId?: number,
    billingStatus?: string
) {
    const ordersPerPage = 10;

    const whereClause: Prisma.OrdersWhereInput = {};

    // Search filter
    if (searchTerm) {
        whereClause.OR = [
            {
                aveugle: {
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
                },
            },
            {
                catalogue: {
                    OR: [
                        {
                            title: {
                                contains: searchTerm,
                                mode: Prisma.QueryMode.insensitive,
                            },
                        },
                        {
                            author: {
                                contains: searchTerm,
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
            ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
            { lentPhysicalBook: true },
            { closureDate: null },
        ];
    } else if (filter === 'late') {
        // Orders older than 30 days without closure date
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        whereClause.AND = [
            ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
            { requestReceivedDate: { lt: thirtyDaysAgo } },
            { closureDate: null },
        ];
    }

    // Status filter
    if (statusId) {
        whereClause.statusId = statusId;
    }

    // Billing status filter
    if (billingStatus && billingStatus !== 'all') {
        whereClause.billingStatus = billingStatus as never;
    }

    try {
        const [orders, totalOrders, statuses] = await Promise.all([
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
            prisma.status.findMany({
                select: {
                    id: true,
                    name: true,
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            }),
        ]);

        return {
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
            availableStatuses: statuses,
        };
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw new Error('Failed to fetch orders');
    }
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
    try {
        const params = await searchParams;

        const page = Math.max(
            1,
            parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
        );
        const searchTerm = Array.isArray(params.search)
            ? params.search[0]
            : params.search || '';
        const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter || 'all';
        const statusId = params.statusId
            ? parseInt(Array.isArray(params.statusId) ? params.statusId[0] : params.statusId)
            : undefined;
        const billingStatus = Array.isArray(params.billingStatus)
            ? params.billingStatus[0]
            : params.billingStatus;

        const { orders, totalOrders, totalPages, availableStatuses } = await getOrders(
            page,
            searchTerm,
            filter,
            statusId,
            billingStatus
        );

        // Serialize orders to convert Decimal to number and Date to string
        const serializedOrders = orders.map(order => ({
            ...order,
            cost: order.cost ? Number(order.cost) : null,
            requestReceivedDate: order.requestReceivedDate.toISOString(),
            closureDate: order.closureDate ? order.closureDate.toISOString() : null,
            createdAt: order.createdDate ? order.createdDate.toISOString() : null,
            updatedAt: order.updatedAt ? order.updatedAt.toISOString() : null,
        }));

        return (
            <div className="space-y-4">
                <OrdersTable
                    initialOrders={serializedOrders}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                    availableStatuses={availableStatuses}
                    initialTotalOrders={totalOrders}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Admin Orders page:', error);
        notFound();
    }
}