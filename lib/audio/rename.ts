import 'server-only';

import { prisma } from '@/lib/prisma';
import { copyTrack, deleteTrack, headTrack, MAX_COPY_BYTES } from './bucket';
import { refreshBookAudioState } from './state';
import { uploadInProgressRefusal } from './uploadLease';

/**
 * Renaming a track in place — not a corbeille operation, just a key change
 * within the same folder.
 *
 * S3/B2 has no rename primitive: this is a copy, a verify, then a delete of
 * the original, exactly the same order of operations as the corbeille move
 * in trash.ts and for the same reason — if the copy or its verification
 * fails, nothing has been lost; the original is only removed once the new
 * key is confirmed to hold the same bytes.
 *
 * ## Never leave the track twice in the folder
 *
 * Both halves of the sequence can stop between the copy and the delete. The
 * copy then sat under its new name next to the original: the book played the
 * chapter twice, counted, weighed and priced it twice, and a second attempt was
 * refused (« un fichier porte déjà ce nom ») by the copy it had left behind.
 *
 *  - a copy that lands at the wrong size is removed again — the new key was
 *    free before the copy (checked below), so nothing else lives there;
 *  - an original B2 will not delete is retried; if it still will not go — and
 *    a HEAD confirms it is still there — the copy is removed instead and the
 *    rename reported as cancelled. If the original turns out to be gone, the
 *    delete happened and only its answer was lost: the rename stands. If
 *    nobody can tell, or BOTH deletes fail, the folder keeps what it holds —
 *    the state is re-read and the message says so.
 */

export class AudioRenameError extends Error {}

/** Extra attempts on top of the SDK's own retries: B2 sheds load with 5xx by design. */
const DELETE_ATTEMPTS = 3;
const RETRY_BASE_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True once `key` is gone — retried, because a 5xx here is B2 asking again later. */
async function deleteWithRetry(key: string): Promise<boolean> {
    for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
        try {
            await deleteTrack(key);
            return true;
        } catch (e) {
            console.error(`renameTrack: suppression refusée (essai ${attempt}/${DELETE_ATTEMPTS})`, key, e);
            if (attempt < DELETE_ATTEMPTS) await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        }
    }
    return false;
}

/** true / false when the storage answered, null when it could not say. */
async function stillPresent(key: string): Promise<boolean | null> {
    try {
        return (await headTrack(key)) !== null;
    } catch (e) {
        console.error('renameTrack: présence de l’original non vérifiable', key, e);
        return null;
    }
}

export async function renameTrack(opts: {
    bookId: number;
    oldKey: string;
    newKey: string;
    userId: number | null;
}): Promise<{ newKey: string; sizeBytes: number }> {
    const { bookId, oldKey, newKey, userId } = opts;
    const oldName = oldKey.slice(oldKey.lastIndexOf('/') + 1);
    const newName = newKey.slice(newKey.lastIndexOf('/') + 1);

    if (newKey === oldKey) {
        throw new AudioRenameError('Le nouveau nom est identique à l’actuel.');
    }

    // An upload may hold a signed PUT on the new name: it would land on the
    // renamed track. See uploadInProgressRefusal.
    const busy = await uploadInProgressRefusal(bookId, 'Renommage impossible', userId);
    if (busy) throw new AudioRenameError(busy);

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
        // A wrong-size copy is still a second track in the folder. The key was
        // free a moment ago, so whatever is there is this copy.
        if (copied && !(await deleteWithRetry(newKey))) await refreshBookAudioState(bookId);
        throw new AudioRenameError(
            'La copie n’a pas pu être vérifiée — renommage annulé, le fichier original est intact.',
        );
    }

    // 3. Only now remove the original.
    //
    // A refused delete is not proof the original is still there: B2 can carry
    // out a delete and lose the answer, three times over. Undoing the copy then
    // removed the ONLY remaining copy, under a message saying the file had
    // stayed under its old name. So the original is looked for before the copy
    // is touched: gone means the rename happened; unknown means hands off.
    if (!(await deleteWithRetry(oldKey))) {
        const originalThere = await stillPresent(oldKey);
        if (originalThere !== false) {
            // Undo the copy rather than leave the chapter in the folder twice —
            // but only when the original is known to be there.
            const undone = originalThere === true && (await deleteWithRetry(newKey));
            if (!undone) await refreshBookAudioState(bookId);
            throw new AudioRenameError(
                undone
                    ? 'Le stockage a refusé de retirer l’ancien nom : renommage annulé, le fichier est ' +
                          'resté sous son nom d’origine. Réessayez dans un instant.'
                    : `Le stockage a refusé de retirer l’ancien nom : la piste est peut-être pour l’instant ` +
                          `dans le dossier sous ses deux noms (« ${oldName} » et « ${newName} »). Actualisez ` +
                          'la liste ; si les deux y sont, supprimez l’un des deux depuis l’éditeur audio ' +
                          '(il part en corbeille).',
            );
        }
    }

    // The measured duration describes the same bytes: it follows the name. A
    // cache, updated in place (not one of the append-only journals), keyed on
    // (bookId, filename) — hence the homonym row removed first. Without this
    // the renamed track read « — » until someone pressed Recalculer.
    await prisma.$transaction([
        prisma.audioTrackDuration.deleteMany({ where: { bookId, filename: newName } }),
        prisma.audioTrackDuration.updateMany({
            where: { bookId, filename: oldName },
            data: { filename: newName },
        }),
    ]);

    // Before the refresh, which reads RENAME events to carry an upload's
    // duration over to the new name (resolveTrackDurations).
    await prisma.audioTrackEvent.create({
        data: {
            bookId,
            action: 'RENAME',
            filename: oldName,
            newFilename: newName,
            sizeBytes: BigInt(head.sizeBytes),
            performedById: userId,
        },
    });

    await refreshBookAudioState(bookId);

    return { newKey, sizeBytes: head.sizeBytes };
}
