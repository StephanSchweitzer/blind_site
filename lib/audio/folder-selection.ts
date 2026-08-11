/**
 * Turning a picked folder into an upload batch.
 *
 * `webkitdirectory` hands the page the browser's whole recursive walk of the
 * chosen folder as a flat `File[]` — sub-folders included, cover art and
 * `Thumbs.db` included. None of it is uploaded implicitly: nothing leaves the
 * machine until the server has signed a URL for it, so this module is where the
 * batch is decided, before a single URL is asked for.
 *
 * Two rules matter beyond the obvious filtering:
 *
 *  - **only direct children are kept.** A book folder is flat, so descending
 *    into sub-folders would interleave `Disque 1` and `Disque 2` into one run
 *    with no way to tell them apart afterwards.
 *  - **the survivors are sorted with `naturalCompare`.** The picker's order is
 *    not guaranteed, and `nextTrackName` numbers files in the order it receives
 *    them — an unsorted batch produces a folder whose chapters play out of
 *    sequence, which is the one failure this codebase works hardest to avoid.
 *
 * Rejects are returned rather than dropped. A permanent who is not told that
 * three files were left behind will believe the chapter uploaded.
 *
 * Pure logic over `File` metadata — no React, no bucket, no `server-only`.
 */

import { isAllowedAudioExtension, isAppleDoubleName, naturalCompare } from './naming';

/**
 * Generous next to the ~55 MB the corpus tops out at, while still bounded.
 * The single source of truth — `app/api/books/[id]/audio/upload-url/route.ts`
 * imports this rather than keeping its own copy in sync by hand.
 */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export type RejectReason = 'sous-dossier' | 'format' | 'taille' | 'vide' | 'métadonnées';

/** Why a file in the chosen folder is not going to be uploaded. */
export const REJECT_LABELS: Record<RejectReason, string> = {
    'sous-dossier': 'dans un sous-dossier',
    format: 'format non audio',
    taille: 'dépasse 500 Mo',
    vide: 'fichier vide',
    métadonnées: 'fichier technique macOS (pas un enregistrement)',
};

export interface RejectedFile {
    /** Path relative to the chosen folder, so a sub-folder reject reads clearly. */
    path: string;
    reason: RejectReason;
}

export interface FolderSelection {
    /** Name of the folder the admin picked, echoed back in the confirmation. */
    rootName: string;
    /** Direct-child audio files, in playback order. */
    files: File[];
    rejected: RejectedFile[];
    totalBytes: number;
}

/**
 * The directory picker fills `webkitRelativePath` with
 * `<dossier choisi>/…/fichier`. A plain multi-file selection leaves it empty,
 * in which case the file is by definition a direct child.
 */
const relativePath = (f: File) => f.webkitRelativePath || f.name;

export function selectFolderAudio(raw: File[]): FolderSelection {
    const kept: File[] = [];
    const rejected: RejectedFile[] = [];
    let rootName = '';

    for (const f of raw) {
        const path = relativePath(f);
        const segments = path.split('/');
        if (!rootName && segments.length > 1) rootName = segments[0];

        // `dossier/fichier` is a direct child; anything longer is nested.
        if (segments.length > 2) {
            rejected.push({ path, reason: 'sous-dossier' });
            continue;
        }
        // Covers the junk every real folder carries — `.DS_Store`, `Thumbs.db`,
        // `desktop.ini`, cover art, notes. The server refuses these too, but it
        // refuses the *whole* request, so a folder batch has to be clean before
        // it is sent.
        if (!isAllowedAudioExtension(f.name)) {
            rejected.push({ path, reason: 'format' });
            continue;
        }
        // Carries an audio extension but is macOS resource-fork metadata. Caught
        // after the extension test on purpose, so it is reported as what it is
        // rather than as an unsupported format — a lecteur on a Mac will hit
        // this on every folder they send, and « format non audio » would send
        // them looking for a problem with their recording.
        if (isAppleDoubleName(f.name)) {
            rejected.push({ path, reason: 'métadonnées' });
            continue;
        }
        if (f.size === 0) {
            rejected.push({ path, reason: 'vide' });
            continue;
        }
        if (f.size > MAX_UPLOAD_BYTES) {
            rejected.push({ path, reason: 'taille' });
            continue;
        }
        kept.push(f);
    }

    kept.sort((a, b) => naturalCompare(a.name, b.name));

    return {
        rootName,
        files: kept,
        rejected,
        totalBytes: kept.reduce((sum, f) => sum + f.size, 0),
    };
}
