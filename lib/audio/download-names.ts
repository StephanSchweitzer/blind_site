/**
 * The names a folder's tracks take inside « Tout télécharger (ZIP) ».
 *
 * Pure string logic — no bucket, no `server-only` — because the archive is built
 * in the browser (hooks/useAudioFolderZip.ts) and the rules are tested under
 * plain Node (scripts/audio-naming.test.ts).
 *
 * The bucket keys are never touched (see .claude/rules/audio-storage.md: no
 * automatic rename). What changes is only the name each file is written under
 * on the volunteer's computer, because that is what a CD is burned from — and
 * a burner, or the player reading an MP3 disc, orders files by name, character
 * by character. The portal orders them with naturalCompare. In 269 live folders
 * (November 2026) the two disagree, almost always on unpadded numbers
 * (`1000 2` after `1000 10`): such a folder, burned from its bucket names,
 * plays out of order.
 */

import { byteOrderCompare, WINDOWS_FORBIDDEN_CHARS } from './naming';
import { CD_BURN_CAPACITY_BYTES, cdFolderName, splitIntoCds } from './cd-split';

/** Characters Windows refuses in a file name: its own unzip tool stops on them. Same set the rename refuses. */
const WINDOWS_FORBIDDEN = new RegExp(WINDOWS_FORBIDDEN_CHARS.source, 'g');

/** The playlist written beside the tracks, for players and burners that read one. */
export const PLAYLIST_NAME = 'Liste de lecture.m3u8';

/**
 * A name Windows can create. Replaced by a space, the same as `sanitiseTrackTitle`
 * does on upload, so a file sent back from this download is still recognised as
 * the track it came from (see alreadyUploadedFinder). Only names that need it are
 * touched: four folders, in November 2026 (`Et ça, ça se met où ? P 7.mp3`).
 */
export function windowsSafeName(name: string): string {
    if (!WINDOWS_FORBIDDEN_CHARS.test(name)) return name;
    return name.replace(WINDOWS_FORBIDDEN, ' ').replace(/\s+/g, ' ').replace(/ (?=\.[^.]+$)/, '').trim();
}

export interface DownloadNames {
    /** One name per track, same order as the input (playback order). */
    names: string[];
    /** True when each name was prefixed with its playback position. */
    numbered: boolean;
}

/**
 * Names for a folder's tracks, given in playback order.
 *
 * When those names already sort in playback order character by character —
 * nearly every folder — they are the bucket names (made Windows-safe where they
 * have to be). Otherwise each one is prefixed with its position, zero-padded to
 * a common width (`001 1000 2 Titre.mp3`), which sorts the same way for a
 * burner, a player, Windows Explorer and the Finder. Prefixing every file rather
 * than only the misplaced ones keeps the rule simple to explain: in that folder,
 * the first number is the order.
 */
export function downloadEntryNames(trackNames: string[]): DownloadNames {
    const safe = trackNames.map(windowsSafeName);
    const unique = dedupe(safe);
    const inOrder = unique.every((n, i) => i === 0 || byteOrderCompare(unique[i - 1], n) < 0);
    if (inOrder) return { names: unique, numbered: false };

    const width = Math.max(3, String(unique.length).length);
    return {
        names: unique.map((n, i) => `${String(i + 1).padStart(width, '0')} ${n}`),
        numbered: true,
    };
}

/**
 * Two names that only differed by a forbidden character can become one. An
 * archive with two entries of the same name extracts as one file — a track lost
 * without a word — so the later one gets a suffix.
 */
function dedupe(names: string[]): string[] {
    const seen = new Set<string>();
    return names.map((n) => {
        let candidate = n;
        for (let k = 2; seen.has(candidate.toLowerCase()); k++) {
            candidate = n.replace(/(\.[^.]+)?$/, (ext) => ` (${k})${ext}`);
        }
        seen.add(candidate.toLowerCase());
        return candidate;
    });
}

/**
 * An M3U playlist of the tracks in playback order, names relative to the
 * playlist itself. CRLF line ends and UTF-8 (hence `.m3u8`): what Windows
 * players and burning software expect, and the names carry accents.
 */
export function playlistM3u(names: string[]): string {
    return ['#EXTM3U', ...names].join('\r\n') + '\r\n';
}

export interface ArchiveLayout {
    /** Path of each track inside the archive, same order as the input (playback order). */
    paths: string[];
    /** Text files written after the tracks: one playlist per folder, paths included. */
    playlists: { name: string; content: string }[];
    /** True when the names carry their playback position — see downloadEntryNames. */
    numbered: boolean;
    /** How many CD folders the archive holds; 0 when it is not split. */
    folders: number;
    /** Indices of tracks too big for one CD, each alone in its folder. Empty when not split. */
    oversized: number[];
}

/**
 * The whole archive's shape: every track's path, and the playlists beside them.
 *
 * Split by CD, the names are still computed once over the **whole** folder and
 * only then distributed into « CD 1 sur 3 », « CD 2 sur 3 »… — so a numbered
 * folder counts on across discs (CD 2 starts at the next track, not at 001), and
 * a file sent back to the portal from any CD is still recognised as the track
 * it came from. Each CD folder gets its own playlist, names relative to it; there
 * is no playlist at the root, which would only list what the folders already do.
 *
 * Deterministic from its input, and that is load-bearing: the archive re-signs
 * expired links by matching paths (useAudioFolderZip), so the re-signed listing
 * must come back through this same function with the same choice.
 */
export function archiveLayout(
    tracks: { name: string; sizeBytes: number }[],
    splitByCd: boolean,
    capacity: number = CD_BURN_CAPACITY_BYTES,
): ArchiveLayout {
    const { names, numbered } = downloadEntryNames(tracks.map((t) => t.name));
    const split = splitByCd ? splitIntoCds(tracks.map((t) => t.sizeBytes), capacity) : null;

    if (!split || split.groups.length <= 1) {
        return {
            paths: names,
            playlists: names.length ? [{ name: PLAYLIST_NAME, content: playlistM3u(names) }] : [],
            numbered,
            folders: 0,
            oversized: [],
        };
    }

    const paths = [...names];
    const count = split.groups.length;
    const playlists = split.groups.map((group, cd) => {
        const folder = cdFolderName(cd, count);
        for (const i of group) paths[i] = `${folder}/${names[i]}`;
        return { name: `${folder}/${PLAYLIST_NAME}`, content: playlistM3u(group.map((i) => names[i])) };
    });
    return { paths, playlists, numbered, folders: count, oversized: split.oversized };
}
