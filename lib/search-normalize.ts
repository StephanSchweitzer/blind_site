/**
 * Typographic folding for search boxes.
 *
 * The problem this solves is not theoretical. The Book table holds BOTH forms
 * of the French apostrophe — 3 881 titles with the straight « ' », 52 with the
 * curly « ’ », and at least one title carrying one of each:
 *
 *     « 45 secondes d’éternité: Mes souvenirs de l'au-delà »
 *
 * so no amount of normalizing the *query* alone can match them, and no data
 * migration would stay true for longer than the next title pasted out of Word
 * or Google Books. The stored side varies, therefore the search has to accept
 * every form on both sides.
 *
 * The catalogue appeared to work only by accident: its raw-SQL path runs both
 * sides through `immutable_unaccent`, and Postgres' unaccent rules happen to
 * fold U+2019/U+2018 onto « ' ». Every Prisma `contains` search — demandes,
 * attributions, factures, paiements, personnes — had no such luck and compared
 * raw bytes, which is exactly where staff reported it breaking.
 *
 * Two exports, with different jobs:
 *
 *   `normalizeSearchText` collapses a string to one canonical spelling. Use it
 *   on anything being *compared in memory*.
 *
 *   `searchVariants` goes the other way: it takes a token and returns every
 *   spelling worth looking for in the database. Use it wherever a query reaches
 *   SQL, because the column cannot be folded on its way past (Prisma has no
 *   `unaccent(col)`, and the raw path still needs the forms unaccent misses,
 *   « ´ » and « ` » among them).
 */

/**
 * Everything typed, pasted or imported where a French apostrophe belongs.
 *
 * « ´ » (U+00B4) and « ` » (U+0060) are in here because they sit unshifted on
 * an AZERTY keyboard and are genuinely what lands in the box, and because
 * Postgres' unaccent does NOT fold them — verified against the database, not
 * assumed.
 */
const APOSTROPHE_CLASS = /['‘’‛ʼʹ′´`]/g;

/** Hyphens and dashes, which Word substitutes freely. */
const DASH_CLASS = /[‐‑‒–—―−]/g;

/** Double quotes, including the French guillemets. */
const QUOTE_CLASS = /[“”„«»]/g;

/** Non-breaking and other exotic spaces, which paste in invisibly. */
const SPACE_CLASS = /[\s    ]+/g;

/** The function the whole module exists for: every apostrophe becomes « ' ». */
export function normalizeApostrophes(str: string): string {
    return str.replace(APOSTROPHE_CLASS, "'");
}

/**
 * One canonical spelling: apostrophes, dashes, quotes and spaces folded.
 *
 * Case and accents are deliberately left alone — the database comparisons are
 * already case-insensitive (`mode: 'insensitive'`) and accent-insensitive on
 * the book path (`immutable_unaccent`), and folding them here would make the
 * two engines disagree about what they are looking for.
 */
export function normalizeSearchText(str: string): string {
    return normalizeQuotesAndDashes(normalizeApostrophes(str))
        .replace(SPACE_CLASS, ' ')
        .trim();
}

function normalizeQuotesAndDashes(str: string): string {
    return str.replace(DASH_CLASS, '-').replace(QUOTE_CLASS, '"');
}

/**
 * The apostrophe spellings a token is expanded back into.
 *
 * « ´ » and « ` » are folded *in* by `normalizeApostrophes` but never expanded
 * back *out*: no row holds them (checked — zero titles), so generating them
 * would cost a LIKE per column per token to match nothing.
 *
 * « ! » is the opposite case, and the asymmetry is deliberate. The NAS sync job
 * substitutes it for an apostrophe on its way to the bucket, so
 * `OrphanAudioFolder.title` and `DeletedAudioTrack.filename` genuinely hold
 * « La puissance de l!acceptation » — three separate normalisers in this repo
 * already strip it for that reason (scripts/audio-match-rules.ts,
 * lib/books/title-match.ts). Expanding an apostrophe INTO « ! » therefore finds
 * those rows, while NOT folding a typed « ! » back into an apostrophe keeps a
 * title that really ends in one (« Cours ! ») searchable as written.
 */
const APOSTROPHE_FORMS = ["'", '’', '‘', '!'];

/**
 * Hyphen spellings. The empty string is what makes « Jean-Pierre » findable as
 * « JeanPierre »; the space is what makes it findable as « Jean Pierre », which
 * matters here because 77 of 858 people carry a hyphenated name and no one
 * remembers which half of it was hyphenated.
 */
const DASH_FORMS = ['-', ' ', ''];

/**
 * Every spelling of one token worth looking for, the canonical form first.
 *
 * Substitution is all-or-nothing per token rather than per character: a single
 * whitespace-delimited word mixing « d’ » and « l' » does not occur (the mixed
 * title above mixes them across *words*), and all-or-nothing keeps this bounded
 * at nine variants instead of 3^n.
 *
 * A token with no apostrophe and no hyphen — the overwhelming majority — comes
 * back as a single-element array, so the common query costs exactly what it
 * costs today. Only the tokens that were previously *failing* pay for the extra
 * clauses.
 */
export function searchVariants(token: string): string[] {
    const normalized = normalizeSearchText(token);
    if (!normalized) return [];

    const hasApostrophe = normalized.includes("'");
    const hasDash = normalized.includes('-');
    if (!hasApostrophe && !hasDash) return [normalized];

    const apostropheForms = hasApostrophe ? APOSTROPHE_FORMS : [''];
    const dashForms = hasDash ? DASH_FORMS : [''];

    const out: string[] = [];
    for (const dash of dashForms) {
        for (const apostrophe of apostropheForms) {
            let variant = normalized;
            if (hasApostrophe) variant = variant.split("'").join(apostrophe);
            if (hasDash) variant = variant.split('-').join(dash);
            // « - » → « » can empty a token out ("--"), and a blank LIKE
            // pattern matches every row.
            if (variant && !out.includes(variant)) out.push(variant);
        }
    }
    return out;
}

/**
 * The letters Postgres' unaccent TRANSLITERATES rather than strips, for the
 * Latin-1 and Latin Extended-A blocks — read off the database (dev PG 18 and
 * production PG 15 agree), not off a Unicode table.
 *
 * NFD alone gets « é » right and every one of these wrong: « Œ », « ß », « Ø »,
 * « Ł » carry no combining mark to strip, so « Oeuvre » never found « Œuvre ».
 * Symbols are in here too (« © », « ½ ») not because anyone searches for
 * them but so the parity check can hold over whole blocks with no allowlist.
 */
const TRANSLITERATIONS: Record<string, string> = {
    '¡': '!', '©': '(c)', 'ª': 'a', '­': '-', '®': '(r)', '±': '+/-',
    'µ': 'μ', 'º': 'o', '¼': ' 1/4', '½': ' 1/2', '¾': ' 3/4', '¿': '?',
    'Æ': 'AE', 'æ': 'ae', 'Ð': 'D', 'ð': 'd', '×': '*', '÷': '/',
    'Ø': 'O', 'ø': 'o', 'Þ': 'TH', 'þ': 'th', 'ß': 'ss', 'ẞ': 'SS',
    'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ĳ': 'IJ', 'ĳ': 'ij',
    'ĸ': 'q', 'Ŀ': 'L', 'ŀ': 'l', 'Ł': 'L', 'ł': 'l', 'ŉ': "'n", 'Ŋ': 'N',
    'ŋ': 'n', 'Œ': 'OE', 'œ': 'oe', 'Ŧ': 'T', 'ŧ': 't', 'ſ': 's',
    '…': '...',
};
const TRANSLITERATION_CLASS = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

/**
 * The fold a `searchKey` column is built with, in JavaScript — the twin of the
 * SQL function `search_fold` (prisma/migrations/manual/…_user_search_key.sql).
 *
 * The two MUST agree character for character. The column is folded by
 * Postgres; the query is folded here, because Prisma cannot wrap a query
 * parameter in a function either. Any character they fold differently is a
 * search that silently misses — which is why `scripts/search-fold.e2e.ts`
 * compares them over whole Unicode blocks and over every stored key.
 *
 * Both sides run the same punctuation pass FIRST (apostrophes, dashes, quotes,
 * spaces — the SQL side translates the very same classes before unaccent
 * sees them), so only letters are left for unaccent and this function to agree
 * on.
 */
export function foldForSearchKey(str: string): string {
    return normalizeSearchText(str)
        .replace(TRANSLITERATION_CLASS, (ch) => TRANSLITERATIONS[ch])
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The spellings of one token to look for in a `searchKey` column.
 *
 * `searchVariants` still does the hyphen work (« Jean Pierre » ↔
 * « Jean-Pierre »); folding each variant afterwards collapses the curly
 * apostrophe forms onto the straight one the key stores, so they cost nothing.
 */
export function searchKeyVariants(token: string): string[] {
    const out: string[] = [];
    for (const variant of searchVariants(token)) {
        const folded = foldForSearchKey(variant);
        if (folded && !out.includes(folded)) out.push(folded);
    }
    return out;
}

/**
 * Lower-case, accent-stripped, apostrophe-folded — for comparing a typed token
 * against a French label held in memory.
 *
 * NOT for anything that reaches SQL. The database comparisons are handled by
 * `searchVariants` (Prisma) and `immutable_unaccent` (raw SQL), and Postgres'
 * unaccent folds a few characters JS's NFD pass does not — « œ » becomes « oe »
 * there and stays « œ » here. Folding a query with this before sending it would
 * therefore make the two sides disagree.
 *
 * Its in-memory cousins `normaliseTitle` (lib/books/title-match.ts) and
 * `normalise` (scripts/audio-match-rules.ts) additionally collapse punctuation
 * to separators, because they build match KEYS rather than compare words.
 */
export function foldForLabelMatch(str: string): string {
    return normalizeApostrophes(str)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();
}
