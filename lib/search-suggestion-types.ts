/**
 * The shape of a « Vouliez-vous dire … ? » proposal, shared by the server that
 * builds it (lib/search-suggest.ts) and the components that show it. Kept free
 * of any server import so client components can use it.
 */

/** The search domains the suggestion vocabulary is split into (see search_vocabulary). */
export const VOCABULARY_DOMAINS = ['people', 'books', 'genres', 'news', 'listes', 'orphans', 'trash'] as const;
export type VocabularyDomain = (typeof VOCABULARY_DOMAINS)[number];

export interface SearchSuggestion {
    /** The query to run instead — what clicking the suggestion puts in the box. */
    query: string;
    /**
     * `spelling`: one or more words replaced by a close word that exists —
     * possibly with one word removed as well (`dropped` then says which).
     * `drop`: one word removed, every other word as typed.
     */
    kind: 'spelling' | 'drop';
    /** The word removed, as typed, for a `drop`. */
    dropped?: string;
    /** Rows the suggested query finds, once verified. */
    count?: number;
    /**
     * `count` is a floor, not a total — a picker verifies through a fetcher
     * capped at N rows, and cannot tell N from more.
     */
    atLeast?: boolean;
}

/** Suggestions offered for one empty result, at most. */
export const MAX_SHOWN_SUGGESTIONS = 3;

/** Rows shown under one proposal, at most. */
export const MAX_PREVIEW_ROWS = 3;

/**
 * One object a proposal would bring back, as the « Essayez plutôt » card
 * shows it — built by each list from its own row (lib/search-rescue.ts).
 */
export interface RescueRow {
    id: number | string;
    /** What the object is: a title, a name, « Demande n°42 — L'Étranger ». */
    title: string;
    /** Who / when, in muted text after the title. */
    detail?: string | null;
    /**
     * Why a lifted filter excluded it — « En attente » under a lifted
     * « Disponibles ». Only filled for proposals that lift a filter.
     */
    note?: string | null;
}

/**
 * What a list proposes when its search found nothing — lib/search-rescue.ts
 * builds it, components/ui/search-rescue.tsx shows it. Unlike a bare
 * SearchSuggestion it carries the objects it finds: « L'Étranger — Albert
 * Camus » is recognised at a glance, « Vouliez-vous dire « camus étranger » ? »
 * asks to be trusted.
 *
 *   `filter`: the same words, with the filters in `lifted` removed — the
 *             search was right, a filter hid the object.
 *   `scope`:  the same words elsewhere on the page (another tab: the person is
 *             an auditeur, not a lecteur).
 *   `spelling` / `drop`: as SearchSuggestion — possibly ALSO with filters
 *             lifted, when no correction finds anything inside them.
 */
export interface RescueSuggestion<R = RescueRow, K extends string = string> {
    kind: 'filter' | 'scope' | SearchSuggestion['kind'];
    /** The search to run — what the action puts in the box. */
    query: string;
    /** The word removed, as typed, for a drop. */
    dropped?: string;
    /** Filter keys the proposal lifts (URL parameter names for most lists); empty when it keeps them. */
    lifted: K[];
    /** The same filters, in the words the page shows them. */
    liftedLabels: string[];
    /** For `scope`: where to search instead, and how the page names it. */
    scope?: string;
    scopeLabel?: string;
    /** Objects the proposal finds. */
    total: number;
    /** The closest of them to what was typed, best first. */
    rows: R[];
}

/**
 * Keep the suggestions that find rows, in the order they are offered. Shared
 * by the server lists and the client pickers so both rank alike.
 *
 * A correction that keeps every word wins outright: when « therse hubrt »
 * finds « thérèse hubert », offering « hubert » alone as well is noise. Only
 * when no full correction finds anything are the shorter queries offered —
 * corrected ones first (closest-first, as they arrive), then plain drops by
 * how much they find.
 */
export function rankVerifiedSuggestions(verified: SearchSuggestion[]): SearchSuggestion[] {
    const found = verified.filter((s) => (s.count ?? 0) > 0);
    const fullCorrections = found.filter((s) => s.kind === 'spelling' && s.dropped === undefined);
    if (fullCorrections.length > 0) return fullCorrections.slice(0, MAX_SHOWN_SUGGESTIONS);

    const correctedDrops = found.filter((s) => s.kind === 'spelling');
    const drops = found.filter((s) => s.kind === 'drop').sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    return [...correctedDrops, ...drops].slice(0, MAX_SHOWN_SUGGESTIONS);
}

/**
 * Count the candidates in two rounds, each run in parallel:
 *
 *   1. full corrections (every word kept, some respelt);
 *   2. only if none of those finds anything: everything else — corrections
 *      with a word dropped, and plain drops.
 *
 * rankVerifiedSuggestions throws the second group away whenever the first
 * finds something, so counting it up front was pure cost — and on the
 * catalogue, where each count scans every book, the costliest part of the
 * whole suggestion.
 */
export async function verifyInStages(
    candidates: SearchSuggestion[],
    verify: (query: string) => Promise<Pick<SearchSuggestion, 'count' | 'atLeast'>>,
): Promise<SearchSuggestion[]> {
    const run = (list: SearchSuggestion[]) =>
        Promise.all(list.map(async (candidate) => ({ ...candidate, ...(await verify(candidate.query)) })));

    const isFullCorrection = (s: SearchSuggestion) => s.kind === 'spelling' && s.dropped === undefined;
    const corrections = await run(candidates.filter(isFullCorrection));
    const ranked = rankVerifiedSuggestions(corrections);
    if (ranked.length > 0) return ranked;

    return rankVerifiedSuggestions(await run(candidates.filter((s) => !isFullCorrection(s))));
}
