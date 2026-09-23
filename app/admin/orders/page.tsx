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
import { getOpenOrderDelais, retardWhere, serializeDelaisFor, type Delai } from '@/lib/orders/delais';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { resolveBookFilter } from '@/lib/books/bookFilter';
import { rescueEmptySearch, rescueNote, RESCUE_CANDIDATES, type RescueFilter } from '@/lib/search-rescue';
import { getOrderBillingStatusLabel, BILLING_STATUS_LABELS } from '@/lib/billing-enums';
import { getUserNameOnly } from '@/lib/users/displayName';
import { parisDate } from '@/lib/paris-day';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

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
    filterBook?: { id: number; title: string }
) {
    const bookId = filterBook?.id;
    const ordersPerPage = 10;

    // Délais par étape — read once, used by the « Retard » filter, by the row
    // badges and by the rescue notes, so all three agree (lib/orders/delais.ts).
    const delais = await getOpenOrderDelais();

    // The whole where clause for a given search term — a function so the
    // « Essayez plutôt » block can count another term, or the same one with
    // some filters `lifted` (keyed by URL parameter) — see lib/search-rescue.ts.
    const whereFor = (searchTerm: string, lifted: string[] = []): Prisma.OrdersWhereInput => {
        const whereClause: Prisma.OrdersWhereInput = {};
        const on = (key: string) => !lifted.includes(key);

        // « Ce livre » — see lib/books/bookFilter.ts.
        if (bookId && on('bookId')) {
            whereClause.catalogueId = bookId;
        }

        // One definition, shared with /api/orders — the two used to carry separate
        // copies of this clause and had already drifted apart.
        if (searchTerm) {
            const tokenClauses = buildOrderSearchWhere(searchTerm);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (filter === 'needsReturn' && on('filter')) {
            whereClause.AND = [
                ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
                { lentPhysicalBook: true },
                { closureDate: null },
            ];
        }

        if (statusId && on('statusId')) {
            whereClause.statusId = statusId;
        }

        if (!on('billingStatus')) {
            // Lifted by a proposal.
        } else if (billingStatus === 'PAID') {
            whereClause.bill = { is: { state: BillingStatus.PAID } };
        } else if (billingStatus && billingStatus !== 'all') {
            whereClause.billingStatus = billingStatus as OrderBillingStatus;
        }

        if (!on('isDuplication')) {
            // Lifted by a proposal.
        } else if (isDuplication === 'true') {
            whereClause.isDuplication = true;
        } else if (isDuplication === 'false') {
            whereClause.isDuplication = false;
        } else if (isDuplication === 'blocked') {
            // Duplications that can't start yet — the book is still being recorded.
            Object.assign(whereClause, blockedDuplicationWhere);
        }

        // Délais par étape (lib/orders/delais.ts) — no longer « déposée il y a
        // plus de 3 mois », which flagged a book the day its lecteur started it.
        const retardClause = on('retard') ? retardWhere(retard, delais) : null;
        if (retardClause) {
            whereClause.AND = [
                ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
                retardClause,
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

        // Only when the search found nothing — see lib/search-rescue.ts.
        const searchSuggestions =
            totalOrders === 0 && searchTerm
                ? await rescueOrders(searchTerm, whereFor, {
                    filter, statusId, billingStatus, isDuplication, retard, filterBook, delais,
                    statusName: (id) => statuses.find((st) => st.id === id)?.name ?? String(id),
                })
                : [];

        // Derived on read, one query for the page — see lib/orders/duplicationBlocked.ts.
        const blockedDuplications = await findBlockedDuplications(orders);

        return {
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
            availableStatuses: statuses,
            blockedDuplications: serializeBlockedDuplications(blockedDuplications),
            delais: serializeDelaisFor(orders.map((o) => o.id), delais),
            searchSuggestions,
        };
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw new Error('Failed to fetch orders');
    }
}

/**
 * « Essayez plutôt » for the demandes — lib/search-rescue.ts. The filters are
 * named as their selects name them, and each demande found says what the
 * lifted filter held against it (its status, its facturation…).
 */
async function rescueOrders(
    search: string,
    whereFor: (term: string, lifted?: string[]) => Prisma.OrdersWhereInput,
    active: {
        filter: string;
        statusId?: number;
        billingStatus?: string;
        isDuplication?: string;
        retard?: string;
        filterBook?: { id: number; title: string };
        delais: Map<number, Delai>;
        statusName: (id: number) => string;
    },
): Promise<RescueSuggestion[]> {
    const filters: RescueFilter[] = [];
    if (active.filterBook) filters.push({ key: 'bookId', label: `Livre : ${active.filterBook.title}` });
    if (active.statusId) filters.push({ key: 'statusId', label: `Statut : ${active.statusName(active.statusId)}` });
    if (active.billingStatus && active.billingStatus !== 'all') {
        filters.push({
            key: 'billingStatus',
            label: `Facturation : ${active.billingStatus === 'PAID'
                ? BILLING_STATUS_LABELS.PAID
                : getOrderBillingStatusLabel(active.billingStatus)}`,
        });
    }
    const types: Record<string, string> = { true: 'Duplication', false: 'Enregistrement', blocked: 'Duplication en attente' };
    if (active.isDuplication && types[active.isDuplication]) {
        filters.push({ key: 'isDuplication', label: `Type : ${types[active.isDuplication]}` });
    }
    const retardLabels: Record<string, string> = { true: 'En retard', surveiller: 'À surveiller', false: 'À jour' };
    if (active.retard && retardLabels[active.retard]) {
        filters.push({ key: 'retard', label: retardLabels[active.retard] });
    }
    if (active.filter === 'needsReturn') filters.push({ key: 'filter', label: 'Livre prêté à rendre' });

    return rescueEmptySearch({
        search,
        domains: ['people', 'books'],
        filters,
        count: (q) => prisma.orders.count({ where: whereFor(q.query, q.lifted) }),
        find: (q) =>
            prisma.orders.findMany({
                where: whereFor(q.query, q.lifted),
                orderBy: { requestReceivedDate: 'desc' },
                take: RESCUE_CANDIDATES,
                include: ordersTableInclude,
            }),
        rankText: (o) => `${o.catalogue?.title ?? ''} ${o.catalogue?.author ?? ''} ${getUserNameOnly(o.aveugle)} ${o.id}`,
        toRow: (o, q): RescueRow => ({
            id: o.id,
            title: `Demande n°${o.id} — ${o.catalogue?.title ?? 'sans livre'}`,
            detail: [getUserNameOnly(o.aveugle), parisDate(o.requestReceivedDate)].filter(Boolean).join(' · '),
            note: rescueNote(q.lifted, {
                bookId: () => o.catalogue?.title ?? null,
                statusId: () => o.status?.name ?? null,
                billingStatus: () => o.bill?.state === 'PAID'
                    ? BILLING_STATUS_LABELS.PAID
                    : getOrderBillingStatusLabel(o.billingStatus),
                isDuplication: () => (o.isDuplication ? 'Duplication' : 'Enregistrement'),
                retard: () => {
                    const niveau = active.delais.get(o.id)?.niveau;
                    return niveau === 'en_retard' ? 'En retard' : niveau === 'a_surveiller' ? 'À surveiller' : 'À jour';
                },
                filter: () => (o.closureDate ? 'Clôturée' : 'En cours'),
            }),
        }),
    });
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

    let orders, totalOrders, totalPages, availableStatuses, blockedDuplications, delais, searchSuggestions;
    try {
        ({ orders, totalOrders, totalPages, availableStatuses, blockedDuplications, delais, searchSuggestions } = await getOrders(
            page,
            searchTerm,
            filter,
            statusId,
            billingStatus,
            isDuplication,
            retard,
            filterBook ?? undefined
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
                delais={delais!}
                filterBook={filterBook}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}