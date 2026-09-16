import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { suggestionCandidates } from '@/lib/search-suggest';
import { VOCABULARY_DOMAINS, type VocabularyDomain } from '@/lib/search-suggestion-types';

/**
 * UNVERIFIED « Vouliez-vous dire … ? » candidates for a picker whose search
 * found nothing: GET /api/search/suggestions?q=morvant&domains=people,books
 *
 * The pickers (EntitySearchCombobox) verify each candidate with their OWN
 * fetcher before showing it, so the filters a picker applies (« lecteurs
 * attribuables », « factures de ce client ») are respected without this route
 * knowing about any of them — the same split as the lists, which verify with
 * their own count (lib/search-suggest.ts).
 *
 * Admin-only: an unverified candidate is a word read from the vocabulary, and
 * the vocabulary holds names and hidden titles. The public pages never call
 * this; they receive verified suggestions from their own routes.
 */
export const GET = withAdmin(async (request) => {
    const params = new URL(request.url).searchParams;
    const q = params.get('q') ?? '';
    const domains = (params.get('domains') ?? '')
        .split(',')
        .filter((d): d is VocabularyDomain => (VOCABULARY_DOMAINS as readonly string[]).includes(d));

    if (!q.trim() || domains.length === 0) return NextResponse.json([]);
    return NextResponse.json(await suggestionCandidates(q, domains));
});
