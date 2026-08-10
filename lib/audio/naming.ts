/**
 * Naming rules for audio folders and tracks.
 *
 * Pure string logic — no bucket access, no `server-only` — so routes, scripts
 * and tests can all use it.
 *
 * The governing constraint is that playback order comes from `naturalCompare`
 * over the whole filename (see bucket-core), because the corpus has no uniform
 * track number: the same catalogue mixes `1000 22- Titre.mp3`,
 * `1000  01 Titre.mp3` and date stamps like `1000 141201_1224.MP3`. So a new
 * filename is only correct if it *sorts after* the folder's current last track.
 * Everything below exists to guarantee that, and to refuse rather than guess
 * when it cannot.
 *
 * Existing keys are never renamed. These rules apply to new uploads only.
 */

/** Extensions we accept on upload — the write-side twin of bucket-core's AUDIO_EXT. */
const ALLOWED_EXT = new Set([
    'mp3', 'm4a', 'm4b', 'wav', 'ogg', 'opus', 'flac', 'aac', 'wma', 'aif', 'aiff',
]);

/** Apostrophe family — dropped outright, since sync tools rewrite these to `!`. */
const APOSTROPHES = new Set(["'", '’', '`', '!']);
/** Path separators and wildcards — replaced by a space so words stay apart. */
const PATH_HOSTILE = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/**
 * Strip the characters that get rewritten in transit, keep the accents.
 *
 * Accents are legal in bucket keys and the catalogue is French, so `Émile`
 * stays `Émile`; it is only the apostrophe family and the path-hostile set that
 * cause the `l'abbé` / `l!abbé` divergence already visible in the corpus.
 */
export function sanitiseTrackTitle(raw: string): string {
    return [...raw]
        .filter((c) => !APOSTROPHES.has(c))
        .map((c) => (PATH_HOSTILE.has(c) || c < ' ' ? ' ' : c))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The clean name a folder should carry, derived from the book it belongs to.
 * Moved here from scripts/audio-match-rules.ts so application code doesn't have
 * to import from `scripts/`.
 */
export function canonicalFolderName(num: number, title: string): string {
    return `${num} ${sanitiseTrackTitle(title)}`;
}

export function splitExtension(filename: string): { base: string; ext: string } {
    const m = /^(.*)\.([A-Za-z0-9]{1,5})$/.exec(filename.trim());
    if (!m) return { base: filename.trim(), ext: '' };
    return { base: m[1], ext: m[2].toLowerCase() };
}

export function isAllowedAudioExtension(filename: string): boolean {
    return ALLOWED_EXT.has(splitExtension(filename).ext);
}

/**
 * AppleDouble metadata stubs — `._piste.mp3` beside `piste.mp3`.
 *
 * macOS writes one of these next to every file it copies onto a non-Mac
 * filesystem, holding the resource fork. They carry the audio extension of the
 * file they describe and none of its content, which is exactly what makes them
 * dangerous here: they pass every extension check, then sit in a folder being
 * counted as tracks. 1 856 of them came in with the migration, doubling the
 * reported track count of about 160 books and blocking their duration outright.
 *
 * The marker is matched at the start of the name OR after a space, because the
 * migration prepended a folder number: `._1 Titre.mp3` is stored as
 * `1000 ._1 Titre.mp3`, and a leading-only test finds none of them.
 *
 * A lecteur uploading from a Mac will hand us these again on the next folder, so
 * this is enforced on the way in as well as ignored on the way out.
 */
export function isAppleDoubleName(filename: string): boolean {
    const name = filename.slice(filename.lastIndexOf('/') + 1);
    return /(^|\s)\._/.test(name);
}

/**
 * Natural comparison, duplicated from bucket-core so this module stays free of
 * the `server-only` import chain. The two must agree — that is the whole point
 * of the ordering check in `nextTrackName` — so they are covered by the same test.
 */
export function naturalCompare(a: string, b: string): number {
    const split = (s: string) => s.replace(/\s+/g, ' ').match(/\d+|\D+/g) ?? [];
    const A = split(a);
    const B = split(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const x = A[i];
        const y = B[i];
        if (/^\d/.test(x) && /^\d/.test(y)) {
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
 * The constant token a folder puts before the track number (`1000` in
 * `1000 22- Titre.mp3`). It carries no information — it is the same on every
 * file in the folder — but dropping it would break ordering, because
 * `naturalCompare` hits it first: a new `023 Titre.mp3` would sort before every
 * existing `1000 …` file. So new names in an established folder must keep it.
 *
 * Returns null when the folder has no single agreed lead.
 */
export function commonLead(filenames: string[]): string | null {
    if (!filenames.length) return null;
    const leads = new Set<string>();
    for (const f of filenames) {
        // A lead is a digit run followed by whitespace and then ANOTHER digit
        // run — `1000 22- Titre`, `1000  01 Titre`, `1000 141201_1224`.
        //
        // The second digit run is what makes this unambiguous. Without it,
        // `001 Chapitre.mp3` — the very convention new folders get — parses as
        // lead 001 with no track number, and the folder can then never be
        // extended, because nothing can be numbered after a track that has no
        // number.
        const m = /^(\d+)\s+(\d+)/.exec(f);
        if (!m) return null;
        leads.add(m[1]);
    }
    return leads.size === 1 ? [...leads][0] : null;
}

/** The first numeric token after the lead — the running order, when there is one. */
function sectionOf(filename: string, lead: string | null): number | null {
    const body = lead ? filename.replace(new RegExp(`^${lead}\\s+`), '') : filename;
    const m = /^(\d+)/.exec(body.trim());
    return m ? Number(m[1]) : null;
}

const pad = (n: number) => String(n).padStart(3, '0');

export interface NextTrackName {
    filename: string;
    /** Which rule produced it — surfaced in the UI so the choice isn't a black box. */
    strategy: 'premier-fichier' | 'suite-numerotation' | 'suite-dernier-fichier';
}

/**
 * The name a newly uploaded file should take in this folder.
 *
 * `existing` must be the folder's current filenames in playback order. The
 * result is guaranteed to sort after the last of them under `naturalCompare`,
 * or the function throws — a wrongly ordered track in an audiobook plays the
 * chapters out of sequence, which is worse than a refused upload.
 */
export function nextTrackName(existing: string[], originalFilename: string): NextTrackName {
    const { base, ext } = splitExtension(originalFilename);
    if (!ALLOWED_EXT.has(ext)) {
        throw new Error(`Extension non autorisée : « ${ext || originalFilename} »`);
    }
    // Refused server-side and not merely filtered in the picker: this is the
    // last gate before a name is minted, and a stub that gets past it becomes a
    // permanent phantom track in the folder.
    if (isAppleDoubleName(originalFilename)) {
        throw new Error(
            `« ${originalFilename} » est un fichier de métadonnées macOS, pas un enregistrement.`,
        );
    }
    const title = sanitiseTrackTitle(base) || 'piste';

    // Empty folder: start a clean, zero-padded sequence with no lead token. Both
    // natural and plain lexicographic ordering agree on these, so the folder
    // stays correctly ordered even under a tool that doesn't use naturalCompare.
    if (!existing.length) {
        return { filename: `${pad(1)} ${title}.${ext}`, strategy: 'premier-fichier' };
    }

    const last = existing[existing.length - 1];
    const lead = commonLead(existing);
    const prefix = lead ? `${lead} ` : '';

    // Preferred: continue the folder's numbering from its highest track number.
    const sections = existing.map((f) => sectionOf(f, lead)).filter((n): n is number => n !== null);
    if (sections.length) {
        const candidate = `${prefix}${pad(Math.max(...sections) + 1)} ${title}.${ext}`;
        if (naturalCompare(candidate, last) > 0) {
            return { filename: candidate, strategy: 'suite-numerotation' };
        }
    }

    // Fallback for folders numbered by date stamp (`1000 141201_1224.MP3`), where
    // "highest + 1" is a date, not a position: increment the last file's own
    // leading number so the new file lands immediately after it.
    const lastSection = sectionOf(last, lead);
    if (lastSection !== null) {
        const width = String(lastSection).length;
        const bumped = String(lastSection + 1).padStart(width, '0');
        const candidate = `${prefix}${bumped} ${title}.${ext}`;
        if (naturalCompare(candidate, last) > 0) {
            return { filename: candidate, strategy: 'suite-dernier-fichier' };
        }
    }

    throw new Error(
        `Impossible de déterminer un nom qui se classe après « ${last} ». ` +
            `Renommez le fichier manuellement avant de l'envoyer.`,
    );
}

/**
 * Prefix for a book that has no audio folder yet.
 *
 * Mirrors the corpus layout `dirt/<année>/<n°>  <titre>/`. The folder number in
 * the existing tree is the Access id (`source_access_id`), which is what lets
 * the orphan screen match a folder back to a book — so we prefer it and fall
 * back to `Book.id` only for books created in the portal after the import.
 *
 * That fallback can collide with an Access id, so the caller MUST check the
 * prefix is unoccupied before writing to it; this function only proposes.
 */
export function newBookFolderPrefix(
    book: { id: number; title: string; source_access_id?: number | null },
    year: number = new Date().getFullYear(),
    root = 'dirt/',
): string {
    const num = book.source_access_id ?? book.id;
    return `${root}${year}/${canonicalFolderName(num, book.title)}/`;
}
