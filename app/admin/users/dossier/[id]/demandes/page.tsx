import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import OrdersTable from '@/app/admin/orders/orders-table';
import { loadOrderList } from '@/lib/orders/orderList';
import { hrefForPage } from '@/lib/pagination';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DemandesTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const aveugleId = parseInt(id);

    // La même liste que /admin/orders, fixée sur cet auditeur (lib/orders/orderList.ts) :
    // mêmes filtres, même recherche, même tri, même pagination. Seule la barre
    // de recherche libre est masquée ici.
    const [list, client] = await Promise.all([
        loadOrderList(sp, { aveugleId }),
        prisma.user.findUnique({
            where: { id: aveugleId },
            select: { id: true, name: true, email: true },
        }),
    ]);

    if (list.redirectToPage) {
        redirect(hrefForPage(`/admin/users/dossier/${aveugleId}/demandes`, sp, list.redirectToPage));
    }

    const presetClient = client ? { ...client, email: client.email ?? '' } : null;

    return (
        <OrdersTable
            initialOrders={list.rows}
            pagination={list.pagination}
            sort={list.sort}
            initialSearch={list.filters.search}
            availableStatuses={list.statuses}
            blockedDuplications={list.blockedDuplications}
            delais={list.serializedDelais}
            hideSearch
            presetClient={presetClient}
            filterBook={list.filterBook}
        />
    );
}
