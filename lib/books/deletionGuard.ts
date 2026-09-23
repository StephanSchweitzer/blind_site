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

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** `client` : la transaction de lockBookForDeletion, pour relire sous verrou. */
export async function readBookUsage(
    bookId: number,
    client: TransactionClient | typeof prisma = prisma,
): Promise<BookUsage> {
    const ids = (rows: { id: number }[]) => rows.map((r) => r.id);
    const [orders, assignments, deletedOrders, deletedAssignments] = await Promise.all([
        client.orders.findMany({
            where: { catalogueId: bookId, deletedAt: null },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        client.assignment.findMany({
            where: { catalogueId: bookId, deletedAt: null },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        client.orders.findMany({
            where: { catalogueId: bookId, deletedAt: { not: null } },
            select: { id: true },
            orderBy: { id: 'asc' },
        }),
        client.assignment.findMany({
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

/** Levée dans la transaction de suppression pour l'annuler ; porte l'usage relu. */
export class BookInUseError extends Error {
    constructor(readonly usage: BookUsage) {
        super(bookUsageRefusal(usage));
        this.name = 'BookInUseError';
    }
}

/**
 * Verrouille la fiche et recompte son usage vivant, juste avant de poser
 * `deletedAt` — dans la même transaction.
 *
 * Le contrôle de readBookDeletionCheck est lu au début de deleteBookWithAudio,
 * et `deletedAt` posé à la fin : entre les deux, le stockage (et en mode
 * corbeille, jusqu'à 45 s de déplacement de pistes). Une demande créée dans
 * cet intervalle passait guardLiveBooks — la fiche était encore vivante — puis
 * se retrouvait sur un livre supprimé.
 *
 * `FOR UPDATE` s'exclut avec le `FOR SHARE` de lockLiveBooks
 * (lib/books/liveBookGuard.ts), que prend toute écriture qui rattache une
 * demande ou une attribution à un livre : l'une des deux transactions attend
 * l'autre, et la seconde voit ce que la première a écrit.
 */
export async function lockBookForDeletion(tx: TransactionClient, bookId: number): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Book" WHERE id = ${bookId} FOR UPDATE`;
    const usage = await readBookUsage(bookId, tx);
    if (bookUsageBlocksDeletion(usage)) throw new BookInUseError(usage);
}

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
