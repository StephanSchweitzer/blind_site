import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Ce qui empêche de supprimer une fiche livre, et comment le dire.
 *
 * `Orders.catalogueId` et `Assignment.catalogueId` sont des clés étrangères en
 * RESTRICT : Postgres refuse la suppression du livre tant qu'une ligne le
 * nomme. La route comptait bien ces lignes avant d'agir — mais avec
 * `prisma.orders.count`, dans lequel le filtre global de lib/prisma.ts injecte
 * `deletedAt: null`. Une demande supprimée depuis le back-office était donc
 * invisible au contrôle tout en bloquant toujours la contrainte : le contrôle
 * passait, la suppression partait, et Postgres la rejetait sous la forme d'un
 * « 500 Failed to delete book » que rien n'expliquait.
 *
 * D'où les DEUX comptes par relation, chacun avec un `deletedAt` explicite —
 * l'injection n'a lieu que si l'appelant ne mentionne pas la colonne.
 *
 * Seules les lignes VIVANTES bloquent désormais. Un livre qui ne garde que de
 * l'historique supprimé n'a plus rien à traiter — et depuis que le livre
 * lui-même se supprime en douceur (`Book.deletedAt`, lib/prisma.ts) plutôt que
 * d'être réellement effacé, le bloquer n'avait plus de sens : la fiche ne
 * quittait jamais Postgres, seule l'API refusait d'agir dessus alors que rien
 * n'empêchait plus la garder cachée. `deletedOrderIds` / `deletedAssignmentIds`
 * restent sur `BookUsage` — la forme de readBookDeletionCheck (deletionPreflight.ts)
 * les porte déjà — mais ne comptent plus dans `bookUsageBlocksDeletion` ni dans
 * `bookUsageRefusal`.
 */

/** Au-delà, la phrase énumère les premiers identifiants puis abrège. */
const MAX_IDS_LISTED = 8;

export interface BookUsage {
    /** Demandes / attributions encore vivantes. */
    orderIds: number[];
    assignmentIds: number[];
    /** Demandes / attributions supprimées logiquement — invisibles des listes. */
    deletedOrderIds: number[];
    deletedAssignmentIds: number[];
}

export async function readBookUsage(bookId: number): Promise<BookUsage> {
    const ids = (rows: { id: number }[]) => rows.map((r) => r.id);
    const [orders, assignments, deletedOrders, deletedAssignments] = await Promise.all([
        prisma.orders.findMany({
            where: { catalogueId: bookId, deletedAt: null },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        prisma.assignment.findMany({
            where: { catalogueId: bookId, deletedAt: null },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        prisma.orders.findMany({
            where: { catalogueId: bookId, deletedAt: { not: null } },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        prisma.assignment.findMany({
            where: { catalogueId: bookId, deletedAt: { not: null } },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
    ]);
    return {
        orderIds: ids(orders),
        assignmentIds: ids(assignments),
        deletedOrderIds: ids(deletedOrders),
        deletedAssignmentIds: ids(deletedAssignments),
    };
}

export const bookUsageBlocksDeletion = (u: BookUsage): boolean =>
    u.orderIds.length > 0 || u.assignmentIds.length > 0;

/** « 3 demandes (#12, #13, #14) » — les identifiants, parce qu'ils se retrouvent. */
function countWithIds(ids: number[], singular: string, plural: string): string {
    const label = ids.length > 1 ? plural : singular;
    const shown = ids.slice(0, MAX_IDS_LISTED).map((id) => `#${id}`).join(', ');
    const rest = ids.length - MAX_IDS_LISTED;
    return `${ids.length} ${label} (${shown}${rest > 0 ? `, et ${rest} autre${rest > 1 ? 's' : ''}` : ''})`;
}

/** « 3 demandes (#12…) et 1 attribution (#7) », l'une ou l'autre moitié omise si vide. */
function joinUsage(orderIds: number[], assignmentIds: number[]): string {
    const parts: string[] = [];
    if (orderIds.length) parts.push(countWithIds(orderIds, 'demande', 'demandes'));
    if (assignmentIds.length) parts.push(countWithIds(assignmentIds, 'attribution', 'attributions'));
    return parts.join(' et ');
}

/**
 * Le refus, en français et avec les identifiants — uniquement pour de l'usage
 * VIVANT désormais (voir le commentaire d'en-tête). Les liens ne sont pas dans
 * la phrase : ils voyagent à part (`links`) et sont rendus par le formulaire,
 * qui les ouvre dans un onglet.
 */
export function bookUsageRefusal(u: BookUsage): string {
    const live = joinUsage(u.orderIds, u.assignmentIds);
    if (!live) return '';
    const pronoun = u.orderIds.length + u.assignmentIds.length > 1 ? 'les' : 'la';
    return (
        `Ce livre est nommé par ${live}. Supprimez-${pronoun} ou rattachez-${pronoun} ` +
        `à un autre livre avant de supprimer la fiche.`
    );
}

/** Les listes filtrées sur ce livre (lib/books/bookFilter.ts). */
export const bookUsageLinks = (bookId: number) => ({
    orders: `/admin/orders?bookId=${bookId}`,
    assignments: `/admin/assignments?bookId=${bookId}`,
});
