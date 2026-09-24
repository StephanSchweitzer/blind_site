import type { Prisma } from '@prisma/client';

/**
 * Le tri de la liste des demandes — à part de lib/orders/orderList.ts parce que
 * le tableau (composant client) lit ces clés et ces sens, et que orderList.ts
 * importe Prisma.
 */

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw);

export const ORDER_SORT_KEYS = ['date', 'id', 'auditeur', 'livre', 'statut'] as const;
export type OrderSortKey = (typeof ORDER_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';
export type OrderSort = { key: OrderSortKey; dir: SortDir };

/**
 * Le sens d'une colonne au premier clic : le plus récent d'abord pour les
 * dates et les numéros, l'ordre alphabétique pour les noms, et pour le statut
 * l'ordre du circuit (À faire → … → Terminée, `Status.sortOrder`).
 */
export const ORDER_SORT_DEFAULT_DIR: Record<OrderSortKey, SortDir> = {
    date: 'desc',
    id: 'desc',
    auditeur: 'asc',
    livre: 'asc',
    statut: 'asc',
};

/** Sans paramètre : les demandes les plus récentes d'abord, comme toujours. */
export const DEFAULT_ORDER_SORT: OrderSort = { key: 'date', dir: 'desc' };

export function parseOrderSort(sp: Record<string, string | string[] | undefined>): OrderSort {
    const key = first(sp.sort) as OrderSortKey | undefined;
    if (!key || !ORDER_SORT_KEYS.includes(key)) return DEFAULT_ORDER_SORT;
    const dir = first(sp.dir);
    return { key, dir: dir === 'asc' || dir === 'desc' ? dir : ORDER_SORT_DEFAULT_DIR[key] };
}

/**
 * Toujours départagé par le numéro : sans clé unique en dernier, deux demandes
 * du même jour (ou du même auditeur) peuvent échanger leur place d'une requête
 * à l'autre, et une ligne apparaître sur deux pages pendant qu'une autre
 * n'apparaît sur aucune.
 */
export function orderListOrderBy(sort: OrderSort): Prisma.OrdersOrderByWithRelationInput[] {
    const { dir } = sort;
    const tieBreak: Prisma.OrdersOrderByWithRelationInput = { id: sort.key === 'id' ? dir : 'desc' };
    switch (sort.key) {
        case 'id':
            return [tieBreak];
        case 'auditeur':
            return [
                { aveugle: { lastName: { sort: dir, nulls: 'last' } } },
                { aveugle: { firstName: { sort: dir, nulls: 'last' } } },
                tieBreak,
            ];
        case 'livre':
            return [{ catalogue: { title: dir } }, tieBreak];
        case 'statut':
            return [{ status: { sortOrder: { sort: dir, nulls: 'last' } } }, { requestReceivedDate: 'desc' }, tieBreak];
        case 'date':
        default:
            return [{ requestReceivedDate: dir }, tieBreak];
    }
}
