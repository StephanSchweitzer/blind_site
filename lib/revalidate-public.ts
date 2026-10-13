import { revalidatePath, revalidateTag } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { CacheTag } from '@/lib/cache-tags';
import { toPublicBook } from '@/lib/books/publicBook';
import { CATALOGUE_PAGE_SIZE } from '@/app/(public)/catalogue/data';

/**
 * On-demand invalidation for a public, statically-served page.
 *
 * - revalidateTag(tag, 'max') marks the tagged Data Cache entries stale with
 *   stale-while-revalidate semantics (the Next 16 two-argument form; the bare
 *   revalidateTag(tag) form is deprecated). On Vercel this propagates across
 *   serverless instances via the Data Cache.
 * - revalidatePath clears the client-side Router Cache for the route so a
 *   <Link> navigation immediately after an edit doesn't serve stale content.
 *
 * Call after a successful write, not before — a failed mutation shouldn't
 * invalidate anything.
 *
 * Every call is paid in ISR writes: each page and cache entry under the tag is
 * regenerated, and rewritten, by the next visitor or crawler. Invalidate when
 * the public site actually shows something different, not on every write.
 */
export function revalidatePublic(tag: CacheTag, path: string): void {
    revalidateTag(tag, 'max');
    revalidatePath(path);
}

/**
 * A genre edit changes both the Catalogue and Coups de cœur, since books are
 * embedded in the latter — invalidate both. A write to one book should go
 * through snapshotPublicBooks / revalidateChangedBooks instead, which only
 * invalidates the pages that book is actually on.
 */
export function revalidateCatalogue(): void {
    revalidatePublic(CACHE_TAGS.catalogue, '/catalogue');
    revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');
}

/**
 * `shown`: what the public site shows of each book (its PublicBook, serialized),
 * or null for a book it doesn't show — hidden, soft-deleted (the lib/prisma.ts
 * extension leaves those out) or nonexistent. `listed`: those of them in an
 * active liste de livres. `null` as a whole: the read failed, so nothing can be
 * ruled out.
 */
export type PublicBooksSnapshot = {
    shown: Map<number, string | null>;
    listed: Set<number>;
} | null;

async function readPublicBooks(bookIds: number[]): Promise<NonNullable<PublicBooksSnapshot>> {
    const [rows, links] = await Promise.all([
        prisma.book.findMany({
            where: { id: { in: bookIds }, hiddenFromCatalogue: false },
            // Ordered, so the same genres always serialize the same way: an
            // unordered read could differ from the snapshot and invalidate for nothing.
            include: { genres: { include: { genre: true }, orderBy: { genreId: 'asc' } } },
        }),
        prisma.coupsDeCoeurBooks.findMany({
            where: { bookId: { in: bookIds }, coupsDeCoeur: { active: true } },
            select: { bookId: true },
        }),
    ]);
    const shown = new Map<number, string | null>(bookIds.map((id) => [id, null]));
    for (const row of rows) shown.set(row.id, JSON.stringify(toPublicBook(row)));
    return { shown, listed: new Set(links.map((l) => l.bookId)) };
}

/**
 * Read BEFORE a write to these books; hand the result to revalidateChangedBooks
 * after it. Never throws: a failed read only means the comparison afterwards
 * can't be trusted, and everything gets invalidated as before.
 */
export async function snapshotPublicBooks(
    bookIds: (number | null | undefined)[],
): Promise<PublicBooksSnapshot> {
    const ids = [...new Set(bookIds.filter((id): id is number => Number.isInteger(id)))];
    try {
        return await readPublicBooks(ids);
    } catch (error) {
        console.error('snapshotPublicBooks: lecture impossible, invalidation complète à suivre', error);
        return null;
    }
}

/**
 * Invalidates the public pages a write actually changed, and no others.
 *
 * The catalogue's cache holds its first page only (the newest
 * CATALOGUE_PAGE_SIZE visible books) plus the title count; the listes de
 * livres cache holds the books of the active lists. A book edit, an audio
 * track renamed or a duration re-measured on any other book changes neither,
 * yet used to regenerate /, /catalogue, /listes-de-livres and every page of
 * the lists — the bulk of the site's ISR writes.
 *
 * - nothing public changed (a back-office-only field, a rename): nothing;
 * - a book appeared or disappeared (created, hidden, deleted, restored): the
 *   count moved, so the catalogue — and the home page figures, same tag;
 * - otherwise the catalogue only if the book is on its first page;
 * - the listes de livres if the book belonged to an active list before the
 *   write or does after it (a fusion's real DELETE takes the book out of its
 *   lists: only the snapshot still knows it was there).
 *
 * Never throws (the write is already done): on a failed read it falls back to
 * revalidateCatalogue().
 */
export async function revalidateChangedBooks(before: PublicBooksSnapshot): Promise<void> {
    if (before === null) {
        revalidateCatalogue();
        return;
    }
    try {
        const ids = [...before.shown.keys()];
        if (!ids.length) return;
        const after = await readPublicBooks(ids);
        const changed = ids.filter((id) => before.shown.get(id) !== after.shown.get(id));
        if (!changed.length) return;

        const visibilityChanged = changed.some(
            (id) => (before.shown.get(id) === null) !== (after.shown.get(id) === null),
        );
        const onFirstPage =
            visibilityChanged ||
            (
                await prisma.book.findMany({
                    // Same filter and order as getCatalogueData.
                    where: { hiddenFromCatalogue: false },
                    select: { id: true },
                    orderBy: { createdAt: 'desc' },
                    take: CATALOGUE_PAGE_SIZE,
                })
            ).some((b) => changed.includes(b.id));

        if (onFirstPage) {
            revalidatePublic(CACHE_TAGS.catalogue, '/catalogue');
        }
        if (changed.some((id) => before.listed.has(id) || after.listed.has(id))) {
            revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');
        }
    } catch (error) {
        console.error('revalidateChangedBooks: lecture impossible, invalidation complète', error);
        revalidateCatalogue();
    }
}
