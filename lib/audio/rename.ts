import 'server-only';

import { copyTrack, deleteTrack, headTrack } from './bucket';
import { refreshBookAudioState } from './state';

/**
 * Renaming a track in place — not a corbeille operation, just a key change
 * within the same folder.
 *
 * S3/B2 has no rename primitive: this is a copy, a verify, then a delete of
 * the original, exactly the same order of operations as the corbeille move
 * in trash.ts and for the same reason — if the copy or its verification
 * fails, nothing has been lost; the original is only removed once the new
 * key is confirmed to hold the same bytes.
 */

export class AudioRenameError extends Error {}

/** CopyObject is single-part; beyond this it would need a multipart copy. */
const MAX_COPY_BYTES = 5 * 1024 * 1024 * 1024;

export async function renameTrack(opts: {
    bookId: number;
    oldKey: string;
    newKey: string;
}): Promise<{ newKey: string; sizeBytes: number }> {
    const { bookId, oldKey, newKey } = opts;

    if (newKey === oldKey) {
        throw new AudioRenameError('Le nouveau nom est identique à l’actuel.');
    }

    const head = await headTrack(oldKey);
    if (!head) throw new AudioRenameError('Ce fichier n’existe plus dans le dossier.');
    if (head.sizeBytes > MAX_COPY_BYTES) {
        throw new AudioRenameError(
            'Fichier trop volumineux pour être renommé en une seule opération.',
        );
    }

    // Refuse to overwrite an existing file — a typo that collides with
    // another track must not silently destroy it.
    const occupied = await headTrack(newKey);
    if (occupied) {
        throw new AudioRenameError('Un fichier porte déjà ce nom dans ce dossier.');
    }

    // 1. Copy first. If this throws, nothing has been lost.
    await copyTrack(oldKey, newKey);

    // 2. Verify the copy actually landed, and at the right size, before
    //    touching the original.
    const copied = await headTrack(newKey);
    if (!copied || copied.sizeBytes !== head.sizeBytes) {
        throw new AudioRenameError(
            'La copie n’a pas pu être vérifiée — renommage annulé, le fichier original est intact.',
        );
    }

    // 3. Only now remove the original.
    await deleteTrack(oldKey);

    await refreshBookAudioState(bookId);

    return { newKey, sizeBytes: head.sizeBytes };
}
