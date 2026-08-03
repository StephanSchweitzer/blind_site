import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';

// Google Books answers a share of otherwise valid requests with a transient
// `503 backendFailed` — independent of the query, the key, or the parameters.
// An immediate retry clears it, so absorb it here instead of surfacing a raw
// status code to the back office.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 150;
const REQUEST_TIMEOUT_MS = 3000;
// Deliberately far tighter than Google's own backoff guidance, which tops out
// around 32-64s over ~5 attempts. That budget suits a background job; here a
// permanent is waiting on the search popover, so failing fast beats grinding.
// This is a UX bound, not a platform one — Vercel allows far longer.
const TOTAL_BUDGET_MS = 7000;

/** Google's retryable set for its APIs: 408, 429 and 5xx. */
const isRetryable = (status: number) => status === 408 || status === 429 || status >= 500;

interface GoogleApiError {
    error?: {
        message?: string;
        details?: { metadata?: { quota_limit?: string } }[];
    };
}

/**
 * A 429 is normally worth retrying, but a *daily* quota won't clear in a few
 * hundred milliseconds — retrying only spends more of a quota that is already
 * gone. Google names the limit it hit in the error details.
 */
const isDailyQuotaExhausted = (status: number, body: GoogleApiError | null) =>
    status === 429 &&
    (body?.error?.details ?? []).some((d) => /perday/i.test(d?.metadata?.quota_limit ?? ''));

/** Honour an upstream Retry-After (delta-seconds or HTTP-date) over our own backoff. */
const retryAfterMs = (res: Response): number | null => {
    const header = res.headers.get('retry-after');
    if (!header) return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(header);
    return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Admin-only: this proxies our metered Google Books key, so an open route lets
// anyone spend our quota. Only the back-office book search calls it.
export const GET = withAdmin(async (request) => {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q) {
        return NextResponse.json({ error: 'Requête manquante' }, { status: 400 });
    }

    const key = process.env.GOOGLE_BOOKS_API_KEY;
    if (!key) {
        console.error('GOOGLE_BOOKS_API_KEY is not set');
        return NextResponse.json(
            { error: 'La recherche Google Books n’est pas configurée.' },
            { status: 500 }
        );
    }

    const url = new URL('https://www.googleapis.com/books/v1/volumes');
    // Google Books treats `intitle:` as a title-only search, so raw ISBNs never
    // match. Detect an ISBN-10/13 (ignoring spaces/hyphens) and use `isbn:` instead.
    const compact = q.replace(/[\s-]/g, '');
    const isIsbn = /^(?:\d{9}[\dxX]|\d{13})$/.test(compact);
    url.searchParams.set('q', isIsbn ? `isbn:${compact}` : `intitle:${q}`);
    url.searchParams.set('maxResults', '5');
    url.searchParams.set('langRestrict', 'fr');
    url.searchParams.set('country', 'FR');
    url.searchParams.set('key', key);

    const startedAt = Date.now();
    // Set when the upstream told us how long to wait; otherwise we back off.
    let upstreamDelayMs: number | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            // Exponential backoff, jittered so concurrent searches don't retry
            // in lockstep.
            const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 2);
            const delay = upstreamDelayMs ?? backoff + Math.random() * backoff;
            // Give up now rather than answer late: a Retry-After can easily be
            // longer than the whole budget.
            if (Date.now() - startedAt + delay > TOTAL_BUDGET_MS) break;
            await sleep(delay);
        }

        try {
            const res = await fetch(url.toString(), {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            const data: GoogleApiError | null = await res.json().catch(() => null);

            if (res.ok && data) {
                return NextResponse.json(data);
            }

            const reason = data?.error?.message ?? `HTTP ${res.status}`;

            if (isDailyQuotaExhausted(res.status, data)) {
                console.error(`Google Books daily quota exhausted: ${reason}`);
                return NextResponse.json(
                    {
                        error:
                            'Le quota de recherche Google Books est épuisé pour ' +
                            'aujourd’hui. Réessayez demain.',
                    },
                    { status: 429 }
                );
            }

            if (!res.ok && !isRetryable(res.status)) {
                // A bad key or a malformed query won't fix itself — don't burn
                // retries on it. The upstream detail stays in the logs rather
                // than reaching the browser.
                console.error(`Google Books rejected the request: ${reason}`);
                return NextResponse.json(
                    { error: 'La recherche Google Books a échoué.' },
                    { status: 502 }
                );
            }

            upstreamDelayMs = retryAfterMs(res);
            console.warn(
                `Google Books attempt ${attempt}/${MAX_ATTEMPTS} failed: ${reason}`
            );
        } catch (error) {
            // Timeout or network failure — same treatment as a transient 5xx.
            upstreamDelayMs = null;
            console.warn(
                `Google Books attempt ${attempt}/${MAX_ATTEMPTS} errored:`,
                error
            );
        }
    }

    return NextResponse.json(
        {
            error:
                'Le service Google Books est momentanément indisponible. ' +
                'Réessayez dans quelques instants.',
        },
        { status: 503, headers: { 'Retry-After': '2' } }
    );
});
