/**
 * Pure filename-matching logic for scripts/audit-audio-files.ts.
 *
 * Split out from the audit script so it can be exercised without touching the
 * network or the database — see scripts/audit-audio-files.test.ts.
 */

/**
 * Turn whatever is stored in audio_filepath into a bucket key. Full URLs (both
 * B2 forms — the friendly `/file/<bucket>/<key>` one and the S3-style host),
 * Windows backslashes, leading slashes and %20 escapes all collapse to the same
 * thing.
 */
export function toKey(raw: string, BUCKET: string): string {
    let v = raw.trim().replace(/\\/g, '/');
    if (/^https?:\/\//i.test(v)) {
        try {
            v = new URL(v).pathname;
        } catch {
            /* keep the raw value */
        }
    }
    try {
        v = decodeURIComponent(v);
    } catch {
        /* not percent-encoded */
    }
    v = v.replace(/^\/+/, '');
    // B2 "friendly"/CDN URLs are https://fNNN.backblazeb2.com/file/<bucket>/<key>.
    v = v.replace(/^file\//, '');
    // A URL path may start with the bucket name (path-style URLs, and the form above).
    if (v.startsWith(`${BUCKET}/`)) v = v.slice(BUCKET.length + 1);
    return v;
}

/**
 * Case / accent / separator / punctuation-insensitive form used for matching.
 *
 * `!` is in the stripped set because sync tools substitute it for an apostrophe:
 * the same book shows up as `l!abbé` on a folder and `l’abbé` on the files
 * inside it. Stripping the whole apostrophe family collapses all four variants
 * (`'`, `’`, `` ` ``, `!`) onto one string.
 */
export function normalise(v: string): string {
    return v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip diacritics — "Émile" === "Emile"
        .toLowerCase()
        .replace(/['’`"!]/g, '')
        .replace(/[^a-z0-9./]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export const basename = (key: string): string => key.split('/').pop() ?? key;
export const stripExt = (name: string): string => name.replace(/\.[a-z0-9]{1,5}$/i, '');

// ------------------------------------------------------------ folder / section

/**
 * A book is a FOLDER, not an object: `dirt/<année>/<n°> <titre>/<pistes>.mp3`.
 * Everything below parses that layout.
 */
export interface ParsedFolder {
    prefix: string; // full key prefix, trailing slash included
    year: number | null;
    num: number | null; // leading number in the folder name — a join key candidate
    title: string; // folder name minus that number
}

export function parseFolder(prefix: string): ParsedFolder {
    const segments = prefix.replace(/\/+$/, '').split('/');
    const name = segments[segments.length - 1] ?? '';
    const parent = segments[segments.length - 2] ?? '';
    const m = /^(\d+)[\s._-]+(.*)$/.exec(name);
    return {
        prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
        year: /^\d{4}$/.test(parent) ? Number(parent) : null,
        num: m ? Number(m[1]) : null,
        title: m ? m[2].trim() : name.trim(),
    };
}

/**
 * THE LINK. Book.audio_filepath holds the NAS path as seen from Windows —
 * `T:\2022\21525  Le secret de l!abbé Saunière` — and the sync job copied that
 * tree verbatim under the bucket's `dirt/` prefix:
 * `dirt/2022/21525  Le secret de l!abbé Saunière/`.
 *
 * Nothing else changed: double spaces, `!` substitutions and capitalisation are
 * identical on both sides, so this is an exact translation, not a guess.
 */
export function dbPathToPrefix(audioFilepath: string, root = 'dirt/'): string {
    const rel = audioFilepath
        .trim()
        .replace(/^[A-Za-z]:[\\/]+/, '') // drop the mapped drive letter (T:\)
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
    if (!rel) return '';
    // Windows cannot store a name ending in a dot or space, so the folder that
    // reached the bucket lost them even though the DB string kept them:
    // `…espionnent le monde.` in the DB is `…espionnent le monde` on disk.
    const cleaned = rel
        .split('/')
        .map((s) => s.replace(/[. ]+$/, ''))
        .join('/');
    // Idempotent: once the backfill has rewritten a row to `dirt/2022/…`, running
    // this again must not produce `dirt/dirt/2022/…`. Both formats coexist during
    // the migration, so every caller has to tolerate either.
    if (root && cleaned.startsWith(root)) return `${cleaned}/`;
    return `${root}${cleaned}/`;
}

export interface ParsedSection {
    key: string;
    lead: number | null; // the constant token ("1000 …") shared by a folder's files
    section: number | null; // the running order — 1, 2, … 39
    title: string;
    size: number;
}

/**
 * `1000 22- Le secret de l’abbé Saunière.mp3` → lead 1000, section 22.
 * `1000    01 Wisigoths intro.mp3`            → lead 1000, section 1.
 *
 * Both separators occur in the real bucket: some folders put a dash between the
 * track number and the title, others just whitespace. Tolerates the spacing
 * drift around either, and a trailing space before the extension.
 */
export function parseSection(key: string, size = 0): ParsedSection {
    const name = stripExt(basename(key));
    const m = /^(?:(\d+)[\s._]+)?(\d+)\s*(?:[-–—]\s*|\s+)(.*)$/.exec(name.trim());
    if (!m) return { key, lead: null, section: null, title: name.trim(), size };
    return {
        key,
        lead: m[1] ? Number(m[1]) : null,
        section: Number(m[2]),
        title: m[3].trim(),
        size,
    };
}

/**
 * Natural ("human") comparison: digit runs compare numerically, everything else
 * lexicographically. `x2` before `x10`, `141201_1224` before `141203_1226`.
 */
export function naturalCompare(a: string, b: string): number {
    // Collapse whitespace runs first: the bucket has `1000    01 T.mp3` next to
    // `1000   02 T.mp3`, and without this the differing run lengths decide the
    // order before the track numbers ever get compared.
    const split = (s: string) => s.replace(/\s+/g, ' ').match(/\d+|\D+/g) ?? [];
    const A = split(a);
    const B = split(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const x = A[i];
        const y = B[i];
        const xn = /^\d/.test(x);
        const yn = /^\d/.test(y);
        if (xn && yn) {
            const d = Number(x) - Number(y);
            if (d) return d;
        } else {
            const d = x.localeCompare(y, 'fr');
            if (d) return d;
        }
    }
    return A.length - B.length;
}

/**
 * Playback order.
 *
 * Track numbering is NOT uniform across the corpus — folders use `1000 12- Titre`,
 * `1000  01 Titre`, and date stamps like `1000 141201_1224.MP3` — so keying the
 * sort on an extracted track number only works for some of them. Natural
 * comparison on the filename handles every observed layout, and degrades to
 * plain alphabetical rather than to nonsense when a folder fits none of them.
 */
export function orderSections(sections: ParsedSection[]): ParsedSection[] {
    return [...sections].sort((a, b) => naturalCompare(basename(a.key), basename(b.key)));
}

export interface FolderIntegrity {
    count: number;
    sections: number[];
    gaps: number[]; // numbers absent from 1..max
    duplicates: number[]; // the same track number twice
    unparsed: string[]; // files whose name doesn't fit the pattern
    leads: number[]; // distinct lead tokens — should be exactly one
    bytes: number;
}

export function inspectFolder(sections: ParsedSection[]): FolderIntegrity {
    const nums = sections.map((s) => s.section).filter((n): n is number => n !== null);
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const n of nums) {
        if (seen.has(n)) duplicates.add(n);
        seen.add(n);
    }
    const max = nums.length ? Math.max(...nums) : 0;
    const gaps: number[] = [];
    for (let i = 1; i <= max; i++) if (!seen.has(i)) gaps.push(i);
    return {
        count: sections.length,
        sections: [...seen].sort((a, b) => a - b),
        gaps,
        duplicates: [...duplicates].sort((a, b) => a - b),
        unparsed: sections.filter((s) => s.section === null).map((s) => s.key),
        leads: [...new Set(sections.map((s) => s.lead).filter((n): n is number => n !== null))],
        bytes: sections.reduce((t, s) => t + s.size, 0),
    };
}

/** Apostrophe family — dropped outright, since sync tools rewrite these. */
const APOSTROPHES = new Set(["'", '’', '`', '!']);
/** Path separators and wildcards — replaced by a space so words stay apart. */
const PATH_HOSTILE = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/**
 * The clean name a folder *should* carry, derived from the book it matched.
 *
 * Useful in both directions: as the target if you ever rename objects, and as
 * the canonical string to store alongside the dirty keys if you don't. Keeps
 * accents (they're legal in keys and the catalogue is French) but drops the
 * characters that get rewritten in transit — the apostrophe family, path
 * separators, and control chars.
 */
export function canonicalFolderName(id: number, title: string): string {
    const clean = [...title]
        .filter((c) => !APOSTROPHES.has(c))
        .map((c) => (PATH_HOSTILE.has(c) || c < ' ' ? ' ' : c))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    return `${id} ${clean}`;
}

/** Group objects into folders keyed by everything up to the last slash. */
export function groupByFolder(
    objects: { key: string; size: number }[],
): Map<string, ParsedSection[]> {
    const folders = new Map<string, ParsedSection[]>();
    for (const o of objects) {
        const i = o.key.lastIndexOf('/');
        if (i < 0) continue; // loose object at the bucket root — not part of a book
        const prefix = o.key.slice(0, i + 1);
        const list = folders.get(prefix);
        const parsed = parseSection(o.key, o.size);
        if (list) list.push(parsed);
        else folders.set(prefix, [parsed]);
    }
    return folders;
}

/** Words of 3+ chars, used to block the fuzzy search (see fuzzyBest). */
export function tokensOf(normBase: string): string[] {
    return [...new Set(normBase.split(/[-/.]/).filter((t) => t.length >= 3))];
}

// ------------------------------------------------------- transformation rules

/**
 * A NAS sync job applies the SAME transformation to every filename, so the
 * mismatch is a rule to be discovered, not noise to be fuzzy-matched. Each axis
 * below is one documented way NAS→bucket sync mangles names; the run tries every
 * combination and keeps whichever explains the most rows by *exact* match.
 */
export interface Rule {
    name: string;
    fn: (s: string) => string;
}

/** Unicode form / encoding. Accented French filenames live or die here. */
export const FORM_RULES: Rule[] = [
    { name: 'tel quel', fn: (s) => s },
    { name: 'NFC', fn: (s) => s.normalize('NFC') },
    { name: 'NFD', fn: (s) => s.normalize('NFD') },
    // "Ã©" -> "é": bytes were written UTF-8 but the DB holds them as latin-1.
    { name: 'mojibake corrigé', fn: (s) => Buffer.from(s, 'latin1').toString('utf8') },
    // The reverse: the bucket holds the mojibake, the DB is clean.
    { name: 'mojibake appliqué', fn: (s) => Buffer.from(s, 'utf8').toString('latin1') },
];

export const SEPARATOR_RULES: Rule[] = [
    { name: '', fn: (s) => s },
    { name: 'espaces→_', fn: (s) => s.replace(/ /g, '_') },
    { name: '_→espaces', fn: (s) => s.replace(/_/g, ' ') },
    { name: 'espaces→-', fn: (s) => s.replace(/ /g, '-') },
];

export const CASE_RULES: Rule[] = [
    { name: '', fn: (s) => s },
    { name: 'minuscules', fn: (s) => s.toLowerCase() },
];

/** Full-width substitutes rclone & friends use for characters S3 dislikes. */
export const FORBIDDEN_CHARS: [RegExp, string][] = [
    [/\?/g, '？'],
    [/\*/g, '＊'],
    [/:/g, '：'],
    [/</g, '＜'],
    [/>/g, '＞'],
    [/\|/g, '｜'],
    [/"/g, '＂'],
];
export const CHAR_RULES: Rule[] = [
    { name: '', fn: (s) => s },
    {
        name: 'car. interdits échappés',
        fn: (s) => FORBIDDEN_CHARS.reduce((acc, [re, to]) => acc.replace(re, to), s),
    },
];

export function bigrams(v: string): Set<string> {
    const out = new Set<string>();
    for (let i = 0; i < v.length - 1; i++) out.add(v.slice(i, i + 2));
    return out;
}

/** Sørensen–Dice on character bigrams: 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
    if (a === b) return 1;
    const A = bigrams(a);
    const B = bigrams(b);
    if (!A.size || !B.size) return 0;
    let hits = 0;
    for (const g of A) if (B.has(g)) hits++;
    return (2 * hits) / (A.size + B.size);
}

export interface Candidate {
    name: string;
    fn: (s: string) => string;
    hits: number;
}

/** Evenly-spaced sample — books are id-ordered, so a head slice would only see
 *  the oldest import batch and could miss a rule that applies to later ones. */
function stride<T>(items: T[], n: number): T[] {
    if (items.length <= n) return items;
    const step = items.length / n;
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(items[Math.floor(i * step)]);
    return out;
}

/**
 * Try every combination of the rule axes and keep the ones that explain the most
 * rows by exact match.
 *
 * Two passes, because the axes multiply out to a couple of thousand candidates
 * and each one runs `normalize()` plus several regexes: score every candidate
 * against a small sample first, then re-score only the survivors against the
 * full catalogue. The reported `hits` are always full-catalogue counts.
 */
export function deriveRules(
    storedKeys: string[],
    byKey: Map<string, string>,
    prefixes: string[],
    sampleSize = 400,
    finalists = 8,
): Candidate[] {
    const candidates: Candidate[] = [];
    const prefixOptions = ['', ...prefixes];

    for (const form of FORM_RULES) {
        for (const sep of SEPARATOR_RULES) {
            for (const cs of CASE_RULES) {
                for (const ch of CHAR_RULES) {
                    for (const prefix of prefixOptions) {
                        for (const shape of ['chemin', 'nom seul'] as const) {
                            const label = [
                                form.name,
                                sep.name,
                                cs.name,
                                ch.name,
                                prefix && `préfixe "${prefix}"`,
                                shape === 'nom seul' && 'nom de fichier seul',
                            ]
                                .filter(Boolean)
                                .join(' + ');
                            const fn = (s: string) => {
                                const body = shape === 'nom seul' ? basename(s) : s;
                                return prefix + ch.fn(cs.fn(sep.fn(form.fn(body))));
                            };
                            candidates.push({ name: label || 'tel quel', fn, hits: 0 });
                        }
                    }
                }
            }
        }
    }

    // Pass 1 — cheap: every candidate against a sample.
    const sample = stride(storedKeys, sampleSize);
    for (const c of candidates) {
        for (const s of sample) if (byKey.has(c.fn(s))) c.hits++;
    }
    candidates.sort((a, b) => b.hits - a.hits);

    // Pass 2 — exact: the survivors against the whole catalogue.
    const survivors = candidates.filter((c) => c.hits > 0).slice(0, finalists);
    if (!survivors.length) return candidates.slice(0, finalists).map((c) => ({ ...c, hits: 0 }));

    if (sample.length < storedKeys.length) {
        for (const c of survivors) {
            c.hits = 0;
            for (const s of storedKeys) if (byKey.has(c.fn(s))) c.hits++;
        }
    }
    return survivors.sort((a, b) => b.hits - a.hits);
}

/** Top-level prefixes in the bucket, most populated first. */
export function topPrefixes(objects: { key: string }[], max = 6): string[] {
    const counts = new Map<string, number>();
    for (const { key } of objects) {
        const i = key.indexOf('/');
        if (i > 0) {
            const p = key.slice(0, i + 1);
            counts.set(p, (counts.get(p) ?? 0) + 1);
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, max)
        .map(([p]) => p);
}

/** Cheap profile of one side, to show *why* a rule won. */
export function profile(values: string[]): string {
    const n = values.length || 1;
    const nfd = values.filter((v) => v !== v.normalize('NFC')).length;
    const moji = values.filter((v) => /Ã|Â|ï¿½/.test(v)).length;
    const spaces = values.filter((v) => v.includes(' ')).length;
    const upper = values.filter((v) => /[A-Z]/.test(v)).length;
    const accent = values.filter((v) => /[^\x20-\x7E]/.test(v)).length;
    const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
    return `non-ASCII ${pct(accent)} · décomposé/NFD ${pct(nfd)} · mojibake ${pct(moji)} · espaces ${pct(spaces)} · majuscules ${pct(upper)}`;
}
