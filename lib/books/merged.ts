import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Where a fused book went.
 *
 * A fusion on /admin/review does not destroy the duplicate in the sense a user
 * means by « supprimé » — it MOVES it. Attributions, demandes, genres and
 * listes are reassigned onto the survivor first, and only the now-empty scalar
 * row is deleted (app/admin/review/actions.ts). The id stops resolving, but the
 * thing it named is still there under another number.
 *
 * So a dead book id is not a dead end: it is a forwarding address, and
 * BookMergeEvent — append-only, indexed on both sides, and exempt from the
 * AuditEvent retention purge — is the register that holds it. Every id ever
 * fused stays resolvable for as long as the merge log does, which is forever.
 *
 * This is deliberately NOT a restore. Restoring a fused duplicate would recreate
 * a bare row with none of the relations that were moved off it — a second, empty
 * fiche competing with the real one. Following the address is the only useful
 * answer.
 */

/** A book id that no longer resolves, and the live book it became. */
export interface MergedBookTarget {
    /** The surviving book, confirmed to still exist. */
    canonicalId: number;
    /** When the fusion that consumed the requested id happened. */
    mergedAt: Date;
    /**
     * Ids walked between the one asked for and `canonicalId`, exclusive of both.
     * A survivor can itself be fused later, so B→C→D must land on D; this says
     * it went through C rather than pretending the hop was direct.
     */
    via: number[];
}

/**
 * Cycles are impossible by construction (a fusion always deletes the duplicate,
 * so an id can be consumed only once) but the chain is data, and data that
 * drives a loop gets a ceiling. Ten hops is far past anything real.
 */
const MAX_HOPS = 10;

/**
 * Follow a deleted book id to the live book it was fused into, or null when it
 * was not a fusion — an ordinary deletion, or an id that never existed.
 *
 * Returns null too when the end of the chain does not resolve to a live row:
 * the survivor was itself hard-deleted outside a fusion, and there is nothing
 * to forward to. Callers then report the plain « introuvable » they would have
 * reported anyway.
 */
export async function resolveMergedBook(bookId: number): Promise<MergedBookTarget | null> {
    if (!Number.isInteger(bookId)) return null;

    const via: number[] = [];
    const seen = new Set<number>([bookId]);
    let current = bookId;
    let mergedAt: Date | null = null;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
        // The most recent fusion that consumed this id. There is only ever one
        // — the row is deleted by it — but ordering makes that explicit rather
        // than assumed.
        const merge = await prisma.bookMergeEvent.findFirst({
            where: { duplicateId: current },
            orderBy: { createdAt: 'desc' },
            select: { canonicalId: true, createdAt: true },
        });
        if (!merge) break;

        // The date that matters is the fusion that consumed the id the caller
        // asked about, not the last hop of the chain.
        mergedAt ??= merge.createdAt;

        if (seen.has(merge.canonicalId)) break;
        seen.add(merge.canonicalId);
        if (current !== bookId) via.push(current);
        current = merge.canonicalId;
    }

    if (mergedAt === null || current === bookId) return null;

    const survivor = await prisma.book.findUnique({
        where: { id: current },
        select: { id: true },
    });
    if (!survivor) return null;

    return { canonicalId: current, mergedAt, via };
}

/**
 * The same question for a page of journal rows, in one query instead of N.
 *
 * Only the ids that were actually fused come back, so a caller can treat
 * "absent from the map" as "this was a real deletion".
 */
export async function resolveMergedBooks(
    bookIds: number[]
): Promise<Map<number, { canonicalId: number; mergedAt: Date }>> {
    const ids = [...new Set(bookIds.filter(Number.isInteger))];
    const found = new Map<number, { canonicalId: number; mergedAt: Date }>();
    if (ids.length === 0) return found;

    const merges = await prisma.bookMergeEvent.findMany({
        where: { duplicateId: { in: ids } },
        orderBy: { createdAt: 'asc' },
        select: { duplicateId: true, canonicalId: true, createdAt: true },
    });

    // Ascending order means a later row overwrites an earlier one, leaving the
    // most recent fusion per id — the same one resolveMergedBook picks.
    for (const merge of merges) {
        found.set(merge.duplicateId, {
            canonicalId: merge.canonicalId,
            mergedAt: merge.createdAt,
        });
    }
    return found;
}
