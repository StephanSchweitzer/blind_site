import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import OrdersTable from './orders-table';
import { notFound, redirect } from 'next/navigation';
import { ordersTableInclude } from '@/types/models/order.model';
import type { Delai } from '@/lib/orders/delais';
import { loadOrderList, type OrderListFilters, type OrderListPage } from '@/lib/orders/orderList';
import { hrefForPage } from '@/lib/pagination';
import type { BookFilter } from '@/lib/books/bookFilter';
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

/**
 * « Essayez plutôt » for the demandes — lib/search-rescue.ts. The filters are
 * named as their selects name them, and each demande found says what the
 * lifted filter held against it (its status, its facturation…).
 */
async function rescueOrders(
    whereFor: (term: string, lifted?: string[]) => Prisma.OrdersWhereInput,
    active: OrderListFilters & {
        filterBook: BookFilter | null;
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
        search: active.search,
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

    let list: OrderListPage;
    let searchSuggestions: RescueSuggestion[] = [];
    try {
        list = await loadOrderList(params);
        // Only when the search found nothing — see lib/search-rescue.ts.
        if (list.pagination.total === 0 && list.filters.search) {
            const { statuses } = list;
            searchSuggestions = await rescueOrders(list.whereFor, {
                ...list.filters,
                filterBook: list.filterBook,
                delais: list.delais,
                statusName: (id) => statuses.find((st) => st.id === id)?.name ?? String(id),
            });
        }
    } catch (error) {
        console.error('Error in Admin Orders page:', error);
        notFound();
    }

    // Hors du try : redirect() lève une exception que Next doit voir passer.
    if (list.redirectToPage) redirect(hrefForPage('/admin/orders', params, list.redirectToPage));

    return (
        <OrdersTable
            initialOrders={list.rows}
            pagination={list.pagination}
            sort={list.sort}
            initialSearch={list.filters.search}
            availableStatuses={list.statuses}
            blockedDuplications={list.blockedDuplications}
            delais={list.serializedDelais}
            filterBook={list.filterBook}
            searchSuggestions={searchSuggestions}
        />
    );
}
