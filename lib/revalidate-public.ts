import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { CacheTag } from '@/lib/cache-tags';

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
 */
export function revalidatePublic(tag: CacheTag, path: string): void {
    revalidateTag(tag, 'max');
    revalidatePath(path);
}

/**
 * A book or genre edit changes both the Catalogue and Coups de cœur, since
 * books are embedded in the latter — invalidate both.
 */
export function revalidateCatalogue(): void {
    revalidatePublic(CACHE_TAGS.catalogue, '/catalogue');
    revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/coups-de-coeur');
}
