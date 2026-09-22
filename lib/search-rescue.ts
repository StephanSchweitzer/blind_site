import { suggestionCandidates, verifySuggestions } from '@/lib/search-suggest';
import { foldForSearchKey } from '@/lib/search-normalize';
import {
    MAX_PREVIEW_ROWS,
    MAX_SHOWN_SUGGESTIONS,
    type RescueSuggestion,
    type SearchSuggestion,
    type VocabularyDomain,
} from '@/lib/search-suggestion-types';

/**
 * What a list proposes when its search found nothing — the objects, not just
 * other words. One engine for every list; each list says what its filters are,
 * how to count and fetch its rows, and how to show one.
 *
 * Why it exists: the permanents found « Vouliez-vous dire … ? » useless. Two
 * reasons, both measured on the catalogue (see lib/books/bookList.ts):
 *
 *   - Most empty searches were RIGHT: a filter hid the object. The old
 *     suggestions were verified under the filters, so they could never say so
 *     — at best they proposed other words that found other objects.
 *   - A proposal named a query, not a thing. The reader had to trust
 *     « compagnon bon » to lead somewhere; now the card shows « Les six
 *     compagnons — Paul-Jacques BONZON », and a wrong guess shows itself.
 *
 * In order, stopping at the first step that finds anything:
 *
 *   1. the same words without each active filter, one at a time, and in each
 *      other scope (tab); then without all the filters at once;
 *   2. spelling corrections and drops (lib/search-suggest.ts), filters kept;
 *   3. the same corrections with every filter lifted.
 *
 * Every filter lifted here is one the viewer set and can unset: nothing a
 * list's own rules exclude (soft-deleted rows, hidden books on the public
 * site) is ever a `filter` — those stay in the list's `where` whatever is
 * lifted.
 *
 * Cost: nothing unless the search already found nothing. Then a count per
 * filter, the vocabulary lookup, a count per correction, and one fetch per
 * proposal shown.
 */

export interface RescueFilter {
    /** How the list recognises it — for most lists, its URL parameter name. */
    key: string;
    /** How the page names it: « Statut : Terminée », « Disponibles ». */
    label: string;
}

export interface RescueQuery {
    /** The search to run. */
    query: string;
    /** Filter keys to leave out. */
    lifted: string[];
    /** Another scope to search instead of the current one (a tab key). */
    scope?: string;
    /**
     * `correction` counts may be stricter than the list itself — the catalogue
     * checks a spelling correction on titles and authors only, not on the
     * descriptions its list also searches.
     */
    purpose: 'filter' | 'scope' | 'correction';
}

export interface RescueOptions<T, R> {
    search: string;
    domains: readonly VocabularyDomain[];
    /** The active filters the viewer could lift. Only those actually set. */
    filters?: RescueFilter[];
    /** Other scopes on the same page (tabs) — `key` is passed back as `scope`. */
    scopes?: RescueFilter[];
    count: (q: RescueQuery) => Promise<number>;
    /**
     * Candidates for the preview — a few more than shown (20 is plenty); they
     * are re-ranked here on what was typed. A list that already ranks them
     * (the catalogue does it in SQL) can return exactly the few it wants.
     */
    find: (q: RescueQuery) => Promise<T[]>;
    /** The text a row is recognised by — title and author, a person's name. */
    rankText: (row: T) => string;
    /** How the card shows the row; the lifted filters say which note to add. */
    toRow: (row: T, q: RescueQuery) => R;
}

/** Enough candidates for the ranking to find the right three among them. */
export const RESCUE_CANDIDATES = 20;

/**
 * A row's note for the lifted filters: what each one held against it — its
 * status under a lifted status filter, and so on. `notes` is keyed like the
 * filters; a filter with nothing to say about the row is simply left out.
 */
export function rescueNote(
    lifted: string[],
    notes: Record<string, () => string | null | undefined>,
): string | null {
    const parts = lifted.map((key) => notes[key]?.()).filter((n): n is string => !!n);
    return parts.length > 0 ? [...new Set(parts)].join(' · ') : null;
}

// ---------------------------------------------------------------- ranking

/**
 * pg_trgm's measure, in memory: words padded with two spaces in front and one
 * behind, cut into three-letter pieces, then shared pieces over all pieces.
 * The lists fetch through Prisma, where Postgres cannot rank for them; the
 * catalogue, which can, uses the same measure in SQL.
 */
function trigrams(text: string): Set<string> {
    const set = new Set<string>();
    for (const word of foldForSearchKey(text).split(/[^a-z0-9]+/)) {
        if (!word) continue;
        const padded = `  ${word} `;
        for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
    }
    return set;
}

export function trigramSimilarity(a: string, b: string): number {
    const ta = trigrams(a);
    const tb = trigrams(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let shared = 0;
    for (const t of ta) if (tb.has(t)) shared++;
    return shared / (ta.size + tb.size - shared);
}

/** The rows closest to what was typed, stable for ties (the list's own order). */
function closest<T>(rows: T[], typed: string, rankText: (row: T) => string): T[] {
    return rows
        .map((row, index) => ({ row, index, score: trigramSimilarity(typed, rankText(row)) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, MAX_PREVIEW_ROWS)
        .map((r) => r.row);
}

// ------------------------------------------------------------------ engine

type Proposal = Omit<RescueSuggestion, 'rows' | 'total' | 'liftedLabels' | 'scopeLabel'> & { total?: number };

/**
 * Proposals for a search that found nothing. Never throws: a proposal is a
 * nicety, and failing to build one must never fail the list that asked.
 */
export async function rescueEmptySearch<T, R>(
    options: RescueOptions<T, R>,
): Promise<RescueSuggestion<R>[]> {
    try {
        return await rescue(options);
    } catch (error) {
        console.error('Suggestions de recherche indisponibles :', error);
        return [];
    }
}

async function rescue<T, R>({
    search,
    domains,
    filters = [],
    scopes = [],
    count,
    find,
    rankText,
    toRow,
}: RescueOptions<T, R>): Promise<RescueSuggestion<R>[]> {
    if (!search.trim()) return [];
    const allKeys = filters.map((f) => f.key);
    const labelOf = (key: string) => filters.find((f) => f.key === key)?.label ?? key;

    const withRows = async (proposals: Proposal[]): Promise<RescueSuggestion<R>[]> => {
        const built = await Promise.all(
            proposals.map(async (p) => {
                const q: RescueQuery = {
                    query: p.query,
                    lifted: p.lifted,
                    scope: p.scope,
                    purpose: p.kind === 'filter' ? 'filter' : p.kind === 'scope' ? 'scope' : 'correction',
                };
                const rows = closest(await find(q), search, rankText);
                return {
                    ...p,
                    liftedLabels: p.lifted.map(labelOf),
                    scopeLabel: p.scope ? scopes.find((s) => s.key === p.scope)?.label : undefined,
                    total: p.total ?? rows.length,
                    rows: rows.map((row) => toRow(row, q)),
                    keys: rows.map(rankText).join('|'),
                };
            }),
        );
        // Two corrections that bring back the same objects (« compagnons
        // bonzon », « compagnon bonzon ») are one proposal, not two cards.
        const seen = new Set<string>();
        return built
            .filter(({ rows, keys }) => {
                if (rows.length === 0 || seen.has(keys)) return false;
                seen.add(keys);
                return true;
            })
            .map(({ keys: _keys, ...s }) => s);
    };

    // ------------------------------------------------ 1. filters and scopes
    if (filters.length > 0 || scopes.length > 0) {
        const tries: Proposal[] = [
            ...filters.map((f) => ({ kind: 'filter' as const, query: search, lifted: [f.key] })),
            ...scopes.map((s) => ({ kind: 'scope' as const, query: search, lifted: [], scope: s.key })),
        ];
        const counted = await Promise.all(
            tries.map(async (t) => ({
                ...t,
                total: await count({
                    query: search,
                    lifted: t.lifted,
                    scope: t.scope,
                    purpose: t.kind === 'filter' ? 'filter' : 'scope',
                }),
            })),
        );
        // The filter hiding the fewest objects is the one that hid THIS one.
        let found = counted.filter((t) => t.total > 0).sort((a, b) => a.total - b.total);
        if (found.length === 0 && filters.length > 1) {
            const total = await count({ query: search, lifted: allKeys, purpose: 'filter' });
            if (total > 0) found = [{ kind: 'filter', query: search, lifted: allKeys, total }];
        }
        if (found.length > 0) {
            const shown = await withRows(found.slice(0, MAX_SHOWN_SUGGESTIONS));
            if (shown.length > 0) return shown;
        }
    }

    // ----------------------------------------------------- 2–3. spelling
    const candidates = await suggestionCandidates(search, domains);
    if (candidates.length === 0) return [];
    for (const lifted of filters.length > 0 ? [[], allKeys] : [[]]) {
        const verified: SearchSuggestion[] = await verifySuggestions(candidates, (query) =>
            count({ query, lifted, purpose: 'correction' }));
        if (verified.length === 0) continue;
        const shown = await withRows(
            verified.map((s) => ({
                kind: s.kind,
                query: s.query,
                dropped: s.dropped,
                lifted,
                total: s.count,
            })),
        );
        if (shown.length > 0) return shown;
    }
    return [];
}
