import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';

// Google Books answers a share of otherwise valid requests with a transient
// `503 backendFailed` — independent of the query, the key, or the parameters.
// An immediate retry clears it, so absorb it here instead of surfacing a raw
// status code to the back office.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 150;
const REQUEST_TIMEOUT_MS = 3000;
// Stop retrying past this point so we always answer well inside the function
// timeout — a gateway timeout would be a worse symptom than the 503 itself.
const TOTAL_BUDGET_MS = 7000;

const isRetryable = (status: number) => status === 429 || status >= 500;

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

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            // Exponential backoff, jittered so concurrent searches don't retry
            // in lockstep.
            const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 2);
            await sleep(backoff + Math.random() * backoff);
        }

        try {
            const res = await fetch(url.toString(), {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            const data = await res.json().catch(() => null);

            if (res.ok && data) {
                return NextResponse.json(data);
            }

            const reason = data?.error?.message ?? `HTTP ${res.status}`;

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

            console.warn(
                `Google Books attempt ${attempt}/${MAX_ATTEMPTS} failed: ${reason}`
            );
        } catch (error) {
            // Timeout or network failure — same treatment as a transient 5xx.
            console.warn(
                `Google Books attempt ${attempt}/${MAX_ATTEMPTS} errored:`,
                error
            );
        }

        if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
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
