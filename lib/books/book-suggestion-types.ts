import type { RescueSuggestion } from '@/lib/search-suggestion-types';

/**
 * What the catalogue proposes when a search finds nothing — built by
 * rescueEmptyBookSearch in lib/books/bookList.ts on the shared engine
 * (lib/search-rescue.ts). Kept free of any server import so client components
 * can use it.
 */

/**
 * The catalogue filters a proposal can lift. `filter` is « Rechercher dans »
 * (back to « Tous les champs »); `hidden` and `audio` exist only in the back
 * office, and the public catalogue never lifts the exclusion of hidden books —
 * it is not a filter there, it is the rule.
 */
export const CATALOGUE_FILTER_KEYS = ['filter', 'genres', 'available', 'hidden', 'audio'] as const;
export type CatalogueFilterKey = (typeof CATALOGUE_FILTER_KEYS)[number];

/**
 * A catalogue proposal: the shared shape (lib/search-rescue.ts) whose rows are
 * whole books — the public page opens its book modal from one, the back
 * office its edit dialogue.
 */
export type BookSearchSuggestion<B> = RescueSuggestion<B, CatalogueFilterKey>;
