import type { SearchSuggestion } from '@/lib/search-suggestion-types';

/**
 * What the catalogue proposes when a search finds nothing — the catalogue's
 * own version of the « Vouliez-vous dire … ? » block (lib/search-suggest.ts),
 * built by rescueEmptyBookSearch in lib/books/bookList.ts. Kept free of any
 * server import so client components can use it.
 *
 * Two differences from the other lists, both from what the permanents
 * reported:
 *
 *   - A search is often empty because a FILTER hides the book, not because of
 *     a word. The other lists verify suggestions under the filters and so can
 *     never say so; here the first thing tried is the same words without each
 *     filter (`kind: 'filter'`).
 *
 *   - Each proposal carries the books it finds. « Vouliez-vous dire « camus
 *     étranger » ? » asks the reader to trust a rewritten query; « L'Étranger —
 *     Albert Camus » is recognised at a glance, and a wrong guess shows itself.
 */

/**
 * The catalogue filters a proposal can lift. `filter` is « Rechercher dans »
 * (back to « Tous les champs »); `hidden` and `audio` exist only in the back
 * office, and the public catalogue never lifts the exclusion of hidden books —
 * it is not a filter there, it is the rule.
 */
export const CATALOGUE_FILTER_KEYS = ['filter', 'genres', 'available', 'hidden', 'audio'] as const;
export type CatalogueFilterKey = (typeof CATALOGUE_FILTER_KEYS)[number];

/** Books shown under one proposal, at most. */
export const MAX_PREVIEW_BOOKS = 3;

export interface BookSearchSuggestion<B> {
    /**
     * `filter`: the same words, with `withoutFilters` lifted.
     * `spelling` / `drop`: as in SearchSuggestion — possibly ALSO with
     * `withoutFilters` lifted, when no correction finds anything inside them.
     */
    kind: 'filter' | SearchSuggestion['kind'];
    /** The search to run — what « Chercher » puts in the box. */
    query: string;
    /** The word removed, as typed, for a drop. */
    dropped?: string;
    /** Filters the proposal lifts; empty when it keeps them all. */
    withoutFilters: CatalogueFilterKey[];
    /**
     * Books the proposal finds. For `filter`, exactly what the list will show
     * once the filter is lifted. For a correction, counted on titles, authors,
     * publishers and genres only — see rescueEmptyBookSearch.
     */
    total: number;
    /** The closest of them, best match first. */
    books: B[];
}
