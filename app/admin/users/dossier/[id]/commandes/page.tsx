import { prisma } from '@/lib/prisma';
import { Prisma, OrderBillingStatus, BillingStatus } from '@prisma/client';
import { ordersTableInclude } from '@/types/models/order.model';

// ⚠️ ADJUST this import to wherever your orders-table.tsx actually lives.
import OrdersTable from '@/app/admin/orders/orders-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ORDERS_PER_PAGE = 10;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CommandesTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const aveugleId = parseInt(id);

    const page = Math.max(1, parseInt(Array.isArray(sp.page) ? sp.page[0] : sp.page || '1'));
    const searchTerm = Array.isArray(sp.search) ? sp.search[0] : sp.search || '';
    const filter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter || 'all';
    const statusId = sp.statusId
        ? parseInt(Array.isArray(sp.statusId) ? sp.statusId[0] : sp.statusId)
        : undefined;
    const billingStatus = Array.isArray(sp.billingStatus) ? sp.billingStatus[0] : sp.billingStatus;
    const isDuplication = Array.isArray(sp.isDuplication) ? sp.isDuplication[0] : sp.isDuplication;
    const retard = Array.isArray(sp.retard) ? sp.retard[0] : sp.retard;

    // Same filtering as the global orders page, locked to this user (as aveugle).
    const whereClause: Prisma.OrdersWhereInput = { aveugleId };

    if (searchTerm) {
        whereClause.OR = [
            {
                aveugle: {
                    OR: [
                        { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                        { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                    ],
                },
            },
            {
                catalogue: {
                    OR: [
                        { title: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                        { author: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                    ],
                },
            },
        ];
    }

    if (filter === 'needsReturn') {
        whereClause.AND = [{ lentPhysicalBook: true }, { closureDate: null }];
    } else if (filter === 'late') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        whereClause.AND = [{ requestReceivedDate: { lt: thirtyDaysAgo } }, { closureDate: null }];
    }

    if (statusId) whereClause.statusId = statusId;

    if (billingStatus === 'PAID') {
        whereClause.bill = { is: { state: BillingStatus.PAID } };
    } else if (billingStatus && billingStatus !== 'all') {
        whereClause.billingStatus = billingStatus as OrderBillingStatus;
    }

    if (isDuplication === 'true') whereClause.isDuplication = true;
    else if (isDuplication === 'false') whereClause.isDuplication = false;

    if (retard === 'true') {
        const existing = Array.isArray(whereClause.AND)
            ? whereClause.AND
            : whereClause.AND ? [whereClause.AND] : [];
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        whereClause.AND = [
            ...existing,
            { requestReceivedDate: { lt: threeMonthsAgo } },
            { statusId: { not: 3 } },
        ];
    } else if (retard === 'false') {
        const existing = Array.isArray(whereClause.AND)
            ? whereClause.AND
            : whereClause.AND ? [whereClause.AND] : [];
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        whereClause.AND = [
            ...existing,
            { OR: [{ requestReceivedDate: { gte: threeMonthsAgo } }, { statusId: 3 }] },
        ];
    }

    const [orders, totalOrders, statuses] = await Promise.all([
        prisma.orders.findMany({
            where: whereClause,
            orderBy: { requestReceivedDate: 'desc' },
            skip: Math.max(0, (page - 1) * ORDERS_PER_PAGE),
            take: ORDERS_PER_PAGE,
            include: ordersTableInclude,
        }),
        prisma.orders.count({ where: whereClause }),
        prisma.status.findMany({
            select: { id: true, name: true },
            orderBy: { sortOrder: 'asc' },
        }),
    ]);

    const client = await prisma.user.findUnique({
        where: { id: aveugleId },
        select: { id: true, name: true, email: true },
    });
    const presetClient = client ? { ...client, email: client.email ?? '' } : null;

    const serializedOrders = orders.map((order) => ({
        ...order,
        cost: order.cost ? Number(order.cost) : null,
        requestReceivedDate: order.requestReceivedDate.toISOString(),
        closureDate: order.closureDate ? order.closureDate.toISOString() : null,
        createdAt: order.createdDate ? order.createdDate.toISOString() : null,
        updatedAt: order.updatedAt ? order.updatedAt.toISOString() : null,
    }));

    return (
        <OrdersTable
            initialOrders={serializedOrders}
            initialPage={page}
            initialSearch={searchTerm}
            totalPages={Math.ceil(totalOrders / ORDERS_PER_PAGE)}
            availableStatuses={statuses}
            initialTotalOrders={totalOrders}
            hideSearch
            presetClient={presetClient}
        />
    );
}