import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache-tags';

/*
 * There is deliberately no « revalidate all of /admin » here any more.
 *
 * revalidatePath('/admin', 'layout') used to run after every back-office write
 * (~60 call sites). It made nothing fresher: the admin pages are force-dynamic
 * and re-query the database on every request, and from a route handler it
 * can't reach the browser's Router Cache either. Its only effect was to throw
 * away what IS cached under /admin — the prerendered pages (/admin/aide/*,
 * /admin/listes-de-livres/new…) and the reference-data entry
 * below, which unstable_cache ties to the layout's path — so the next visit
 * rebuilt and rewrote them. Each rebuild is an ISR write on Vercel.
 *
 * - Route handlers: nothing to call. The client's router.refresh() re-reads.
 * - Server Actions: call refresh() from next/cache, which refreshes the
 *   client router without invalidating any cache entry.
 * - Public pages: revalidatePublic / revalidateChangedBooks (lib/revalidate-public.ts).
 */

/**
 * Drops the cached reference lists (lib/reference-data.ts) the admin layout
 * hands to every form. `expire: 0` rather than the 'max' profile public pages
 * use: stale-while-revalidate would serve the old list once more, so a genre
 * created a second ago would be missing from the very next book form opened.
 * The prerendered admin pages carry this tag too (unstable_cache hands its tags
 * to the page being rendered), so they are rebuilt with the new list.
 * Call after a successful write to a genre, statut, format or civilité.
 */
export function revalidateReferenceData(): void {
    revalidateTag(CACHE_TAGS.referenceData, { expire: 0 });
}
