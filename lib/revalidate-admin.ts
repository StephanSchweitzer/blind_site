import { revalidatePath } from 'next/cache';

/**
 * Marks every server-rendered page under /admin as stale so the next
 * navigation OR router.refresh() re-queries the database.
 *
 * Call this from any route handler that mutates admin table data. Orders,
 * assignments and bills are linked (status propagates between them via
 * statusSync), so a single mutation can change rows in several tables at
 * once — we therefore revalidate the whole /admin subtree rather than one
 * path. revalidatePath is lazy (it only marks the cache entry stale; the
 * refetch happens on the next request), so it is safe to call at the top of
 * a handler, before or after the write.
 */
export function revalidateAdmin(): void {
    revalidatePath('/admin', 'layout');
}
