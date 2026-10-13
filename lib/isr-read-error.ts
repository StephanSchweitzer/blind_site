import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * What a statically served (ISR) page or route should do when a database read
 * fails: degrade (render an empty state, answer 500), or rethrow.
 *
 * Whatever an ISR render returns is cached and served until the next
 * regeneration — an empty catalogue or a 500 included, for up to a day
 * (`revalidate = 86400`) or until the next edit. A render that THROWS is not
 * cached: Next keeps serving the last good version and tries again on a later
 * visit. So in production a failed read must throw.
 *
 * Except during `next build`, where a throw fails the whole deploy over a
 * database hiccup — there the degraded render is the lesser evil, and the next
 * regeneration replaces it. And in `next dev`, where nothing is cached and an
 * empty state reads better than an error overlay.
 */
export function degradeOnReadError(): boolean {
    return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NODE_ENV === 'development';
}
