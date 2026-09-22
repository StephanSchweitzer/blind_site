import { prisma } from '@/lib/prisma';
import { searchTokens } from '@/lib/search';
import { foldForSearchKey } from '@/lib/search-normalize';
import {
    VOCABULARY_DOMAINS,
    verifyInStages,
    type SearchSuggestion,
    type VocabularyDomain,
} from '@/lib/search-suggestion-types';

/**
 * What to propose when a search bar finds nothing.
 *
 * Every word of a query must match something (see buildTokenizedSearch), so
 * two things empty a list that should not be empty: a word misspelled
 * (« morvant »), or a word that names nothing on the row (« bernard morvan
 * facture »). Staff in their late seventies meet both, and an empty table
 * says neither. This module turns them into one-click proposals:
 *
 *   « Vouliez-vous dire « bernard morvan » ? — 12 résultats »
 *   « Chercher sans « facture » — 3 résultats »
 *
 * Two stages, deliberately separate:
 *
 *   `suggestionCandidates` GUESSES — spelling from the `search_vocabulary`
 *   trigram index, drops by removing one word at a time. It knows nothing of
 *   the list being searched or its filters.
 *
 *   `verifySuggestions` CHECKS each guess with the list's own count (same
 *   filters, same permissions) and keeps only those that find rows. Nothing is
 *   ever proposed that would lead to another empty page — and a word read from
 *   a hidden book or another list can never surface through a suggestion,
 *   because it would verify to zero there.
 *
 * Cost: nothing at all unless the search already returned zero rows. Then one
 * indexed vocabulary lookup (a few ms), up to MAX_SPELLING_CANDIDATES counts
 * for the corrections, and — only if none of them finds anything — the counts
 * for the drops.
 */

/** Words shorter than this are never corrected: too many near neighbours. */
const MIN_PIECE_LENGTH = 3;

/**
 * When a vocabulary word counts as « close ». Two measures, because each misses
 * a kind of typo the other catches — tuned on the real vocabulary:
 *
 *   similarity (whole words):  « therse → thérèse » 0.50, « hubrt → hubert »
 *   0.44, but « policer → policiers » only 0.38: every extra letter costs.
 *
 *   word_similarity (the typed word inside the longer one): « policer →
 *   policiers » 0.63, « romn → roman » 0.60 — but it also scores a bare prefix
 *   high (« mar → marseille » 0.75), so it only counts when the word is at
 *   most MAX_EXTRA_LETTERS longer than what was typed.
 *
 * Unrelated neighbours sit near 0.3 on the first measure and 0.5 on the second.
 */
const MIN_SIMILARITY = 0.4;
const MIN_WORD_SIMILARITY = 0.6;
const MAX_EXTRA_LETTERS = 3;

/** Counts run per empty search, at most. */
const MAX_CANDIDATES = 9;

/**
 * Of those, spent on spelling combinations at most — the rest go to drops.
 * Three, because the app's connection pool holds three (lib/prisma.ts): the
 * corrections are counted together, and a fourth would wait for a whole
 * extra round trip to the database.
 */
const MAX_SPELLING_CANDIDATES = 3;

/** Misspelt words whose runners-up are combined; past this, only the best of each. */
const MAX_COMBINED_PIECES = 3;

/** Past this many words, trying each drop costs more than it is worth. */
const MAX_TOKENS_FOR_DROPS = 6;

/**
 * The separators the vocabulary was split on (search_vocabulary migration),
 * applied to a folded token — so « l'etrenger » yields the piece « etrenger ».
 */
const SUGGESTION_PIECE_SPLIT = /[\s!-/:-@[-`{-~‘’‛ʼ´«»“”„‐–—…]+/;

const isNumber = (token: string) => /^\d+$/.test(token);

/**
 * Words that find nothing on their own. A drop that leaves only these
 * (« Chercher sans « procès » : « le » ») lists half the table and helps no one.
 */
const FILLER_WORDS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux', 'et', 'ou', 'en', 'dans', 'sur',
    'sous', 'par', 'pour', 'avec', 'sans', 'ce', 'ces', 'cet', 'cette', 'son', 'sa', 'ses', 'mon',
    'ma', 'mes', 'qui', 'que', 'est', 'il', 'elle', 'je', 'tu', 'nous', 'vous', 'ils', 'elles',
]);

const isFiller = (token: string) => {
    const folded = foldForSearchKey(token);
    return folded.length < MIN_PIECE_LENGTH || FILLER_WORDS.has(folded);
};

/**
 * Edit distance (optimal string alignment: insert, delete, substitute, swap two
 * neighbours). Re-ranks the trigram matches, which alone prefer a short common
 * word to the right longer one: « bonzn » scores 0.43 against « bon » and 0.44
 * against « bonzon » — a tie, won by the commoner word — while one letter
 * separates it from « bonzon » and two from « bon ».
 */
function editDistance(a: string, b: string): number {
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
    }
    return d[a.length][b.length];
}

interface VocabularyMatch {
    piece: string;
    word: string;
    similarity: number;
    /** editDistance from the piece typed. */
    distance: number;
}

/**
 * For each piece: whether it already exists as a word, and its closest words
 * otherwise. Returns null when the vocabulary is unavailable (view missing on
 * a database the migration has not reached) — suggestions then fall back to
 * drops only, and the search itself is untouched.
 */
async function lookUpPieces(
    pieces: string[],
    domains: VocabularyDomain[],
): Promise<{ known: Set<string>; matches: Map<string, VocabularyMatch[]> } | null> {
    if (pieces.length === 0) return { known: new Set(), matches: new Map() };
    try {
        // One statement, so one round trip and one pooled connection: whether
        // each piece is already a word, and — only for those that are not —
        // its closest words. From Vercel to Supabase every round trip counts.
        const rows = await prisma.$queryRawUnsafe<
            { piece: string; known: boolean; word: string | null; fold: string | null; similarity: number | null }[]
        >(
            `SELECT p.piece, p.known, v.word, v.fold, v.similarity
             FROM (
                 SELECT piece, EXISTS (
                     SELECT 1 FROM search_vocabulary
                     WHERE domain = ANY($1::text[]) AND fold = piece
                 ) AS known
                 FROM unnest($2::text[]) AS piece
             ) p
             LEFT JOIN LATERAL (
                 SELECT word, fold, similarity(fold, p.piece) AS similarity
                 FROM search_vocabulary
                 -- « % » is the trigram index's own pre-filter (similarity ≥ 0.3).
                 WHERE NOT p.known
                   AND domain = ANY($1::text[])
                   AND fold % p.piece
                   AND (similarity(fold, p.piece) >= $3
                        OR (word_similarity(p.piece, fold) >= $4
                            AND length(fold) <= length(p.piece) + $5))
                 -- Similarities within 0.05 of each other are a tie, and a tie
                 -- goes to the commoner word: « étranger » (0.50, 9 books)
                 -- over « strenger » (0.50, 1 book).
                 ORDER BY round((similarity(fold, p.piece) * 20)::numeric) DESC,
                          freq DESC,
                          word_similarity(p.piece, fold) DESC
                 -- More than are ever offered: editDistance re-ranks them below.
                 LIMIT 10
             ) v ON true`,
            domains,
            pieces,
            MIN_SIMILARITY,
            MIN_WORD_SIMILARITY,
            MAX_EXTRA_LETTERS,
        );
        const known = new Set(rows.filter((row) => row.known).map((row) => row.piece));
        const ranked = new Map<string, VocabularyMatch[]>();
        for (const row of rows) {
            if (row.word === null) continue;
            const list = ranked.get(row.piece) ?? [];
            // The same word can come from two domains (a person and an author).
            if (!list.some((m) => foldForSearchKey(m.word) === foldForSearchKey(row.word!))) {
                list.push({
                    piece: row.piece,
                    word: row.word,
                    similarity: Number(row.similarity),
                    distance: editDistance(row.piece, row.fold ?? foldForSearchKey(row.word)),
                });
            }
            ranked.set(row.piece, list);
        }
        // Fewest edits first; the SQL order (similarity, then the commoner
        // word) settles ties — Array.prototype.sort is stable.
        const matches = new Map<string, VocabularyMatch[]>();
        for (const [piece, list] of ranked) {
            matches.set(piece, list.sort((a, b) => a.distance - b.distance).slice(0, 6));
        }
        return { known, matches };
    } catch (error) {
        console.error('search_vocabulary indisponible, suggestions orthographiques ignorées :', error);
        return null;
    }
}

/**
 * Candidate queries for a search that found nothing — UNVERIFIED. Most callers
 * want `suggestSearches`; the pickers call this through
 * /api/search/suggestions and verify with their own fetcher instead.
 */
export async function suggestionCandidates(
    searchTerm: string,
    domains: readonly VocabularyDomain[],
): Promise<SearchSuggestion[]> {
    const tokens = searchTokens(searchTerm);
    if (tokens.length === 0) return [];
    const validDomains = domains.filter((d) => (VOCABULARY_DOMAINS as readonly string[]).includes(d));

    // ---------------------------------------------------------------- spelling
    const foldedTokens = tokens.map((token) => foldForSearchKey(token));
    const piecesByToken = foldedTokens.map((folded, i) =>
        isNumber(tokens[i])
            ? []
            : folded.split(SUGGESTION_PIECE_SPLIT).filter((p) => p.length >= MIN_PIECE_LENGTH && !isNumber(p)),
    );
    const allPieces = [...new Set(piecesByToken.flat())];
    const lookup = validDomains.length > 0 ? await lookUpPieces(allPieces, validDomains) : null;

    const unknownPieces = lookup
        ? allPieces.filter((p) => !lookup.known.has(p) && (lookup.matches.get(p)?.length ?? 0) > 0)
        : [];

    /** The query with each unknown piece replaced by its `rank(piece)`-th closest word. */
    const correctedTokens = (rank: (piece: string) => number): string[] | null => {
        let changed = false;
        const out = tokens.map((token, i) => {
            let folded = foldedTokens[i];
            let touched = false;
            for (const piece of piecesByToken[i]) {
                if (!unknownPieces.includes(piece)) continue;
                const match = lookup!.matches.get(piece)![rank(piece)];
                if (!match) continue;
                folded = folded.replace(piece, match.word);
                touched = true;
            }
            if (!touched) return token;
            changed = true;
            return folded;
        });
        return changed ? out : null;
    };

    const candidates: SearchSuggestion[] = [];
    const push = (suggestion: SearchSuggestion) => {
        const key = foldForSearchKey(suggestion.query);
        if (key === foldForSearchKey(tokens.join(' '))) return;
        if (candidates.some((c) => foldForSearchKey(c.query) === key)) return;
        candidates.push(suggestion);
    };

    // Every combination of each unknown piece's closest words, fewest edits
    // first. Two misspelt words need it: « camu etrenger » must try « camus
    // étranger » even when « strenger » was the closer match for the second
    // word taken alone. A single word offers its 3 closest, two or three words
    // their 2 closest each, more than that only the best of each — and of all
    // the combinations only the MAX_SPELLING_CANDIDATES closest are counted.
    const perPiece = unknownPieces.length === 1 ? 3 : unknownPieces.length <= MAX_COMBINED_PIECES ? 2 : 1;
    let combos: { ranks: Map<string, number>; score: number }[] = [{ ranks: new Map(), score: 0 }];
    for (const piece of unknownPieces) {
        const matches = lookup!.matches.get(piece)!.slice(0, perPiece);
        combos = combos.flatMap((combo) =>
            matches.map((match, rank) => ({
                ranks: new Map(combo.ranks).set(piece, rank),
                // The rank breaks ties, so lookUpPieces' order holds within
                // the same number of edits.
                score: combo.score - match.distance - rank * 0.001,
            })),
        );
    }
    combos.sort((a, b) => b.score - a.score);

    let best: string[] | null = null;
    for (const combo of combos.slice(0, MAX_SPELLING_CANDIDATES)) {
        const corrected = correctedTokens((piece) => combo.ranks.get(piece) ?? 0);
        if (!corrected) continue;
        best ??= corrected;
        push({ kind: 'spelling', query: corrected.join(' ') });
    }

    // ------------------------------------------------------------------- drops
    if (tokens.length >= 2 && tokens.length <= MAX_TOKENS_FOR_DROPS) {
        // From the corrected query too: « bernard morvant facture » needs both
        // the correction AND the drop to find anything.
        const bases = best ? [best, tokens] : [tokens];
        for (const base of bases) {
            base.forEach((_, i) => {
                const rest = base.filter((__, j) => j !== i);
                if (rest.every(isFiller)) return;
                // Dropping the only corrected word leaves the words as typed:
                // that is a plain drop, whichever base produced it.
                const asTyped = rest.every((word, j) => word === tokens[j < i ? j : j + 1]);
                push({ kind: asTyped ? 'drop' : 'spelling', dropped: tokens[i], query: rest.join(' ') });
            });
        }
    }

    return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Keep the candidates that find rows, counted by the caller's own search. See
 * verifyInStages: corrections are counted first, and the drops only when no
 * correction finds anything.
 *
 * A count that throws is treated as zero: a suggestion is a nicety and must
 * never break the page that asked for it.
 */
export async function verifySuggestions(
    candidates: SearchSuggestion[],
    count: (query: string) => Promise<number>,
): Promise<SearchSuggestion[]> {
    return verifyInStages(candidates, async (query) => {
        try {
            return { count: await count(query) };
        } catch (error) {
            console.error('Vérification de suggestion impossible :', error);
            return { count: 0 };
        }
    });
}

/**
 * The whole thing, for a list that has just found nothing for `searchTerm`.
 * `count(query)` must run the list's real search — every filter the user has
 * set — with `query` in place of the search term.
 */
export async function suggestSearches(
    searchTerm: string,
    domains: readonly VocabularyDomain[],
    count: (query: string) => Promise<number>,
): Promise<SearchSuggestion[]> {
    if (!searchTerm.trim()) return [];
    try {
        return await verifySuggestions(await suggestionCandidates(searchTerm, domains), count);
    } catch (error) {
        console.error('Suggestions de recherche indisponibles :', error);
        return [];
    }
}
