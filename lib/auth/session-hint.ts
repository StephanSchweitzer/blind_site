/**
 * A cookie that only says « this browser has signed in here », readable by the
 * page's own script.
 *
 * Without it, SessionProvider (app/providers.tsx) asked GET /api/auth/session
 * on every page load — one function invocation per visitor on public pages
 * that are otherwise served from the ISR cache, only to decide whether the
 * navbar shows « Administration ». The session cookie itself is httpOnly, so
 * the page cannot tell an anonymous visitor from a permanent without asking;
 * this cookie lets it skip the question when the answer is obviously no.
 *
 * It grants nothing and carries nothing: the authority stays the JWT, the DB
 * check in proxy.ts and the API guards. A stale hint costs one session read,
 * after which it is cleared; a missing one only hides the navbar link until
 * the next visit to /admin, where proxy.ts sets it again.
 */
export const SESSION_HINT_COOKIE = 'eca-connecte';

/** next-auth's JWT session lifetime (lib/auth.ts keeps the 30-day default). */
export const SESSION_HINT_MAX_AGE = 30 * 24 * 60 * 60;

export function hasSessionHint(): boolean {
    return document.cookie.split('; ').some((c) => c.startsWith(`${SESSION_HINT_COOKIE}=`));
}

export function clearSessionHint(): void {
    document.cookie = `${SESSION_HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}
