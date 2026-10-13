/**
 * Cache-Control for the public, session-blind GET routes the public pages call
 * from the browser (/api/catalogue, /api/news, /api/listes-de-livres/preview and
 * /position).
 *
 * Same body for everyone, so Vercel's CDN may answer a repeated query for a
 * minute without invoking the function — a search typed by two visitors, or
 * retyped by one, costs one invocation instead of several.
 *
 * `max-age=0` keeps the browser out of it: without it, it served its own copy
 * of a URL already seen, and a permanent who had just hidden a book still found
 * it in the public search. The CDN keeps its minute.
 *
 * Only on a success: an error must never be held by the CDN.
 */
export const PUBLIC_READ_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export const PUBLIC_READ_HEADERS: HeadersInit = { 'Cache-Control': PUBLIC_READ_CACHE_CONTROL };
