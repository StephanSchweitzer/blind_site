import 'server-only';

import { prisma } from '@/lib/prisma';
import { copyTrack, deleteTrack, headTrack, ensureFolderPlaceholder } from './bucket';
import { refreshBookAudioState } from './state';

/**
 * Soft deletion for audio tracks.
 *
 * Removing a track is not a bucket delete. The object is copied to the
 * `corbeille/` prefix, the copy is verified, and only then is the original
 * removed — so a mistake is a restore, not a loss.
 *
 * The bucket does have versioning enabled, but its lifecycle rule expires
 * noncurrent versions after 30 days and B2 cannot record which portal user
 * deleted what. For recordings that are frequently the only copy in existence,
 * neither is sufficient, hence this layer on top.
 *
 * There is deliberately NO permanent-purge operation: every action in this
 * module is reversible. If disk pressure ever makes purging necessary it should
 * arrive as its own reviewed change, not as a switch inside the delete path.
 */

export const TRASH_PREFIX = 'corbeille/';

/** CopyObject is single-part; beyond this it would need a multipart copy. */
const MAX_COPY_BYTES = 5 * 1024 * 1024 * 1024;

/** Where a deleted object is parked. Timestamped so re-deleting a re-uploaded
 *  file of the same name never collides with the earlier row. */
export function trashKeyFor(bookId: number, filename: string): string {
    return `${TRASH_PREFIX}${bookId}/${Date.now()}-${filename}`;
}

export class AudioTrashError extends Error {}

/**
 * Move one track to the corbeille and record who did it.
 *
 * The caller is responsible for having checked that `key` really belongs to
 * `bookId` (see isKeyInsidePrefix) — this function does not re-derive it.
 */
export async function softDeleteTrack(opts: {
    bookId: number;
    key: string;
    filename: string;
    userId: number | null;
}): Promise<{ trashId: number; trashKey: string; sizeBytes: number }> {
    const { bookId, key, filename, userId } = opts;

    const head = await headTrack(key);
    if (!head) throw new AudioTrashError('Ce fichier n’existe plus dans le dossier.');
    if (head.sizeBytes > MAX_COPY_BYTES) {
        throw new AudioTrashError(
            'Fichier trop volumineux pour être déplacé vers la corbeille en une seule opération.',
        );
    }

    const trashKey = trashKeyFor(bookId, filename);

    // 1. Copy first. If this throws, nothing has been lost.
    await copyTrack(key, trashKey);

    // 2. Verify the copy actually landed, and at the right size. Deleting the
    //    original on the strength of a CopyObject that returned without being
    //    checked is exactly how irreplaceable files disappear.
    const copied = await headTrack(trashKey);
    if (!copied || copied.sizeBytes !== head.sizeBytes) {
        throw new AudioTrashError(
            'La copie de sauvegarde n’a pas pu être vérifiée — suppression annulée, le fichier est intact.',
        );
    }

    // 3. Record the row BEFORE removing the original, so a crash between the two
    //    leaves a recoverable trace rather than an orphaned copy nobody can find.
    const row = await prisma.deletedAudioTrack.create({
        data: {
            bookId,
            originalKey: key,
            trashKey,
            filename,
            sizeBytes: BigInt(head.sizeBytes),
            deletedById: userId,
        },
        select: { id: true },
    });

    // 4. Only now remove the original.
    await deleteTrack(key);

    // Removing the last track would otherwise make the folder itself disappear,
    // turning "an admin emptied this" into "this book's path points nowhere".
    await ensureFolderPlaceholder(key.slice(0, key.lastIndexOf('/') + 1));

    await refreshBookAudioState(bookId);

    return { trashId: row.id, trashKey, sizeBytes: head.sizeBytes };
}

/** Put a track back where it came from. */
export async function restoreTrack(opts: {
    trashId: number;
    userId: number | null;
}): Promise<{ bookId: number | null; originalKey: string }> {
    const { trashId, userId } = opts;

    const row = await prisma.deletedAudioTrack.findUnique({ where: { id: trashId } });
    if (!row) throw new AudioTrashError('Entrée de corbeille introuvable.');
    if (row.restoredAt) throw new AudioTrashError('Ce fichier a déjà été restauré.');

    const inTrash = await headTrack(row.trashKey);
    if (!inTrash) {
        throw new AudioTrashError('La copie de sauvegarde est introuvable dans la corbeille.');
    }

    // Refuse to overwrite. Between the delete and the restore someone may have
    // uploaded a new track at the same key; clobbering it would destroy a
    // recording while appearing to undo one.
    const occupied = await headTrack(row.originalKey);
    if (occupied) {
        throw new AudioTrashError(
            'Un fichier occupe déjà cet emplacement — restauration annulée pour ne pas l’écraser.',
        );
    }

    await copyTrack(row.trashKey, row.originalKey);

    const restored = await headTrack(row.originalKey);
    if (!restored || restored.sizeBytes !== Number(row.sizeBytes)) {
        throw new AudioTrashError('La restauration n’a pas pu être vérifiée.');
    }

    await prisma.deletedAudioTrack.update({
        where: { id: trashId },
        data: { restoredAt: new Date(), restoredById: userId },
    });

    // The corbeille copy is only removed once the original is verifiably back.
    await deleteTrack(row.trashKey);

    if (row.bookId) await refreshBookAudioState(row.bookId);

    return { bookId: row.bookId, originalKey: row.originalKey };
}
