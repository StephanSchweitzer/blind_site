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
 * l'injection n'a lieu que si l'appelant ne mentionne pas la colonne. Les deux
 * situations n'appellent d'ailleurs pas la même réponse :
 *   - des demandes / attributions vivantes : il y a quelque chose à traiter
 *     d'abord, et les listes filtrées par `?bookId=` le montrent ;
 *   - uniquement de l'historique supprimé : il n'y a plus rien à traiter, la
 *     fiche est définitivement non supprimable (la suppression logique existe
 *     précisément pour garder cet historique) et la bonne manœuvre est de la
 *     masquer du catalogue.
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
    u.orderIds.length > 0 ||
    u.assignmentIds.length > 0 ||
    u.deletedOrderIds.length > 0 ||
    u.deletedAssignmentIds.length > 0;

/** « 3 demandes (#12, #13, #14) » — les identifiants, parce qu'ils se retrouvent. */
function countWithIds(ids: number[], singular: string, plural: string): string {
    const label = ids.length > 1 ? plural : singular;
    const shown = ids.slice(0, MAX_IDS_LISTED).map((id) => `#${id}`).join(', ');
    const rest = ids.length - MAX_IDS_LISTED;
    return `${ids.length} ${label} (${shown}${rest > 0 ? `, et ${rest} autre${rest > 1 ? 's' : ''}` : ''})`;
}

/** « 3 demandes (#12…) et 1 attribution (#7) », l'une ou l'autre moitié omise si vide. */
function joinUsage(orderIds: number[], assignmentIds: number[], deleted = false): string {
    const parts: string[] = [];
    if (orderIds.length) {
        parts.push(
            deleted
                ? countWithIds(orderIds, 'demande supprimée', 'demandes supprimées')
                : countWithIds(orderIds, 'demande', 'demandes'),
        );
    }
    if (assignmentIds.length) {
        parts.push(
            deleted
                ? countWithIds(assignmentIds, 'attribution supprimée', 'attributions supprimées')
                : countWithIds(assignmentIds, 'attribution', 'attributions'),
        );
    }
    return parts.join(' et ');
}

/**
 * Le refus, en français et avec les identifiants. Les liens ne sont pas dans la
 * phrase : ils voyagent à part (`links`) et sont rendus par le formulaire, qui
 * les ouvre dans un onglet — et surtout, une demande supprimée n'apparaît dans
 * aucune liste, donc son identifiant est tout ce qu'on peut honnêtement donner.
 */
export function bookUsageRefusal(u: BookUsage): string {
    const live = joinUsage(u.orderIds, u.assignmentIds);
    const dead = joinUsage(u.deletedOrderIds, u.deletedAssignmentIds, true);
    const phrases: string[] = [];

    if (live) {
        const pronoun = u.orderIds.length + u.assignmentIds.length > 1 ? 'les' : 'la';
        phrases.push(
            `Ce livre est nommé par ${live}. Supprimez-${pronoun} ou rattachez-${pronoun} ` +
                `à un autre livre avant de supprimer la fiche.`,
        );
    }
    if (dead) {
        phrases.push(
            `${live ? 'Il garde aussi' : 'Ce livre garde'} l'historique de ${dead}, ` +
                `conservé volontairement : la fiche ne peut donc plus être supprimée. ` +
                `Cochez « Masqué du catalogue public » pour la retirer du catalogue et des ` +
                `listes de livres — elle reste utilisable par les permanents.`,
        );
    }
    return phrases.join(' ');
}

/** Les listes filtrées sur ce livre (lib/books/bookFilter.ts). */
export const bookUsageLinks = (bookId: number) => ({
    orders: `/admin/orders?bookId=${bookId}`,
    assignments: `/admin/assignments?bookId=${bookId}`,
});
