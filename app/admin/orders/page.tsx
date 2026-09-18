import { prisma } from '@/lib/prisma';
import { Prisma, OrderBillingStatus, BillingStatus } from '@prisma/client';
import { buildOrderSearchWhere } from '@/lib/search';
import OrdersTable from './orders-table';
import { notFound } from 'next/navigation';
import { ordersTableInclude } from '@/types/models/order.model';
import {
    blockedDuplicationWhere,
    findBlockedDuplications,
    serializeBlockedDuplications,
} from '@/lib/orders/duplicationBlocked';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { resolveBookFilter } from '@/lib/books/bookFilter';
import { suggestSearches } from '@/lib/search-suggest';

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
    billingStatus?: string,
    isDuplication?: string,
    retard?: string,
    bookId?: number
) {
    const ordersPerPage = 10;

    // The whole where clause for a given search term — a function so the
    // « Vouliez-vous dire » check counts another term under the same filters.
    const whereFor = (searchTerm: string): Prisma.OrdersWhereInput => {
        const whereClause: Prisma.OrdersWhereInput = {};

        // « Ce livre » — see lib/books/bookFilter.ts.
        if (bookId) {
            whereClause.catalogueId = bookId;
        }

        // One definition, shared with /api/orders — the two used to carry separate
        // copies of this clause and had already drifted apart.
        if (searchTerm) {
            const tokenClauses = buildOrderSearchWhere(searchTerm);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (filter === 'needsReturn') {
            whereClause.AND = [
                ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
                { lentPhysicalBook: true },
                { closureDate: null },
            ];
        } else if (filter === 'late') {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            whereClause.AND = [
                ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
                { requestReceivedDate: { lt: thirtyDaysAgo } },
                { closureDate: null },
            ];
        }

        if (statusId) {
            whereClause.statusId = statusId;
        }

        if (billingStatus === 'PAID') {
            whereClause.bill = { is: { state: BillingStatus.PAID } };
        } else if (billingStatus && billingStatus !== 'all') {
            whereClause.billingStatus = billingStatus as OrderBillingStatus;
        }

        if (isDuplication === 'true') {
            whereClause.isDuplication = true;
        } else if (isDuplication === 'false') {
            whereClause.isDuplication = false;
        } else if (isDuplication === 'blocked') {
            // Duplications that can't start yet — the book is still being recorded.
            Object.assign(whereClause, blockedDuplicationWhere);
        }

        if (retard === 'true') {
            const existingConditions = Array.isArray(whereClause.AND)
                ? whereClause.AND
                : whereClause.AND
                    ? [whereClause.AND]
                    : [];

            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            whereClause.AND = [
                ...existingConditions,
                { requestReceivedDate: { lt: threeMonthsAgo } },
                { statusId: { not: 3 } },
            ];
        } else if (retard === 'false') {
            const existingConditions = Array.isArray(whereClause.AND)
                ? whereClause.AND
                : whereClause.AND
                    ? [whereClause.AND]
                    : [];

            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

            whereClause.AND = [
                ...existingConditions,
                {
                    OR: [
                        { requestReceivedDate: { gte: threeMonthsAgo } },
                        { statusId: 3 },
                    ]
                }
            ];
        }
        return whereClause;
    };
    const whereClause = whereFor(searchTerm);

    try {
        const [orders, totalOrders, statuses] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                orderBy: { requestReceivedDate: 'desc' },
                skip: pageSkip(page, ordersPerPage),
                take: ordersPerPage,
                include: ordersTableInclude,
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

        // Only when the search found nothing — see lib/search-suggest.ts.
        const searchSuggestions =
            totalOrders === 0 && searchTerm
                ? await suggestSearches(searchTerm, ['people', 'books'], (q) =>
                    prisma.orders.count({ where: whereFor(q) }))
                : [];

        // Derived on read, one query for the page — see lib/orders/duplicationBlocked.ts.
        const blockedDuplications = await findBlockedDuplications(orders);

        return {
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
            availableStatuses: statuses,
            blockedDuplications: serializeBlockedDuplications(blockedDuplications),
            searchSuggestions,
        };
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw new Error('Failed to fetch orders');
    }
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search || '';
    const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter || 'all';
    const statusId = params.statusId
        ? parseInt(Array.isArray(params.statusId) ? params.statusId[0] : params.statusId)
        : undefined;
    const billingStatus = Array.isArray(params.billingStatus)
        ? params.billingStatus[0]
        : params.billingStatus;
    const isDuplication = Array.isArray(params.isDuplication)
        ? params.isDuplication[0]
        : params.isDuplication;
    const retard = Array.isArray(params.retard) ? params.retard[0] : params.retard;
    const filterBook = await resolveBookFilter(params.bookId);

    let orders, totalOrders, totalPages, availableStatuses, blockedDuplications, searchSuggestions;
    try {
        ({ orders, totalOrders, totalPages, availableStatuses, blockedDuplications, searchSuggestions } = await getOrders(
            page,
            searchTerm,
            filter,
            statusId,
            billingStatus,
            isDuplication,
            retard,
            filterBook?.id
        ));
    } catch (error) {
        console.error('Error in Admin Orders page:', error);
        notFound();
    }

    const serializedOrders = orders!.map(order => ({
        ...order,
        cost: order.cost ? Number(order.cost) : null,
        pricePerPage: order.pricePerPage != null ? Number(order.pricePerPage) : null,
        transferFee: order.transferFee != null ? Number(order.transferFee) : null,
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
                totalPages={totalPages!}
                availableStatuses={availableStatuses!}
                initialTotalOrders={totalOrders!}
                blockedDuplications={blockedDuplications!}
                filterBook={filterBook}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}