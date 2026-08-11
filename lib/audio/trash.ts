import 'server-only';

import { prisma } from '@/lib/prisma';
import { copyTrack, deleteTrack, deleteTracks, headTrack, ensureFolderPlaceholder, MAX_COPY_BYTES } from './bucket';
import { refreshBookAudioState } from './state';
import { pool } from '@/lib/concurrency';

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

export { TRASH_PREFIX } from './trash-prefix';
import { TRASH_PREFIX } from './trash-prefix';

/** Where a deleted object is parked. Timestamped so re-deleting a re-uploaded
 *  file of the same name never collides with the earlier row. */
export function trashKeyFor(bookId: number, filename: string): string {
    return `${TRASH_PREFIX}${bookId}/${Date.now()}-${filename}`;
}

export class AudioTrashError extends Error {}

/** Copies run this many at a time. CopyObject has no batch form; everything else here does. */
const COPY_CONCURRENCY = 10;

export interface BulkTrashResult {
    /** Tracks moved to the corbeille by this call. */
    moved: number;
    /** Tracks an earlier interrupted attempt had already moved. */
    skipped: number;
    /** Tracks still sitting in the folder, with why. */
    failed: { filename: string; reason: string }[];
    /**
     * Per-track detail for what THIS call actually moved — keyed by the
     * original key, so a single-track caller (softDeleteTrack) can pull its
     * own trashId/trashKey back out without a second query. Empty for
     * tracks skipped as already-parked (`skipped`, not `moved`).
     */
    parked: { key: string; trashId: number; trashKey: string; sizeBytes: number }[];
}

/**
 * Move a whole folder's worth of tracks to the corbeille.
 *
 * ## Why this exists rather than a loop over softDeleteTrack
 *
 * That loop is fine for the one track an admin removes from the audio dialogue,
 * and quietly catastrophic for a book. Per track it costs a HEAD, a COPY, a
 * HEAD, an INSERT, a DELETE — and then `ensureFolderPlaceholder`, which LISTS
 * the folder, and `refreshBookAudioState`, which LISTS it again and writes the
 * book, and an event INSERT. Eleven or so round trips each, strictly serial, and
 * two full folder listings PER TRACK. A 77-track book runs that ~900 times in
 * one request, listing the same folder 154 times to reach the same answer.
 *
 * Almost all of it is per-folder work being done per file. Here it happens once:
 *
 *   sizes come from the caller's listing        (the first HEAD disappears)
 *   copies run COPY_CONCURRENCY at a time       (the only irreducibly per-object call)
 *   rows are written with two createMany calls  (was two INSERTs per track)
 *   originals go in one DeleteObjects call      (was one DELETE per track)
 *   placeholder and state refresh happen once   (was twice per track, with listings)
 *
 * A 77-track folder lands at roughly twenty sequential steps instead of nine
 * hundred.
 *
 * ## Resumable on purpose
 *
 * Tracks already recorded in the corbeille are skipped, so a call that ran out
 * of time can simply be made again and continues where it stopped. That is what
 * makes a timeout survivable rather than a half-emptied folder nobody can
 * account for — and it is why the caller must not delete the book until `failed`
 * comes back empty.
 *
 * Copies are verified exactly as the single-track path verifies them: the
 * original is only removed once its copy has been read back at the right size.
 * That check is the point of the whole module and is not what was slow.
 */
export async function softDeleteTracks(opts: {
    bookId: number;
    /** The book's folder prefix, for the placeholder. */
    prefix: string;
    tracks: { key: string; name: string; sizeBytes: number }[];
    userId: number | null;
    /**
     * Skip the placeholder and the state refresh. Two callers need this:
     *  - the book row is about to be deleted, so there is no folder left to
     *    keep alive and no book left to describe;
     *  - the caller already holds a listing of the prefix and will call
     *    refreshBookAudioState itself once, with that listing, after this
     *    returns — doing it here too would be a second, redundant LIST (see
     *    commit/route.ts, which routes mis-sized uploads through here).
     */
    skipFinalisation?: boolean;
    /**
     * The prefix's complete, unfiltered listing from just before this call —
     * the same shape `listRawObjects` returns. When given, the placeholder
     * check and the state refresh use it (minus whatever this call actually
     * removed) instead of listing the prefix again; the caller usually
     * already has it, from deciding what to pass as `tracks`.
     */
    priorObjects?: { key: string; size: number }[];
}): Promise<BulkTrashResult> {
    const { bookId, prefix, tracks, userId, skipFinalisation = false, priorObjects } = opts;
    if (!tracks.length) return { moved: 0, skipped: 0, failed: [], parked: [] };

    // Resume: anything an earlier attempt already parked is done.
    const already = await prisma.deletedAudioTrack.findMany({
        where: {
            bookId,
            restoredAt: null,
            originalKey: { in: tracks.map((t) => t.key) },
        },
        select: { originalKey: true },
    });
    const done = new Set(already.map((r) => r.originalKey));
    const todo = tracks.filter((t) => !done.has(t.key));
    if (!todo.length) return { moved: 0, skipped: done.size, failed: [], parked: [] };

    const failed: BulkTrashResult['failed'] = [];

    // --- Copy and verify, in parallel. Nothing is destroyed in this phase. ---
    const copied = await pool(todo, COPY_CONCURRENCY, async (track) => {
        if (track.sizeBytes > MAX_COPY_BYTES) {
            failed.push({
                filename: track.name,
                reason: 'fichier trop volumineux pour une copie en une seule opération',
            });
            return null;
        }
        const trashKey = trashKeyFor(bookId, track.name);
        try {
            await copyTrack(track.key, trashKey);
            const check = await headTrack(trashKey);
            if (!check || check.sizeBytes !== track.sizeBytes) {
                failed.push({
                    filename: track.name,
                    reason: 'copie de sauvegarde non vérifiable — fichier laissé intact',
                });
                return null;
            }
            return { ...track, trashKey };
        } catch (e) {
            console.error('softDeleteTracks: copie impossible', track.key, e);
            failed.push({ filename: track.name, reason: 'copie vers la corbeille impossible' });
            return null;
        }
    });

    const ok = copied.filter((c): c is NonNullable<typeof c> => c !== null);
    if (!ok.length) return { moved: 0, skipped: done.size, failed, parked: [] };

    // --- Record BEFORE removing anything, so a crash between the two leaves a
    //     recoverable trace rather than an orphaned copy nobody can find. Also
    //     required by the foreign key: bookId can only be set while the book row
    //     still exists. *AndReturn so a single-track caller (softDeleteTrack)
    //     can hand back its own trashId without a second query.
    const createdRows = await prisma.deletedAudioTrack.createManyAndReturn({
        data: ok.map((t) => ({
            bookId,
            originalKey: t.key,
            trashKey: t.trashKey,
            filename: t.name,
            sizeBytes: BigInt(t.sizeBytes),
            deletedById: userId,
        })),
        select: { id: true, originalKey: true },
    });
    const rowIdByKey = new Map(createdRows.map((r) => [r.originalKey, r.id]));

    // --- Only now remove the originals, in as few calls as B2 allows.
    const { failed: notDeleted } = await deleteTracks(ok.map((t) => t.key));
    const notDeletedKeys = new Set(notDeleted);
    for (const key of notDeletedKeys) {
        const track = ok.find((t) => t.key === key);
        // The copy and the row both exist, so nothing is lost — the original
        // simply outlived the call and will be skipped as already-parked on the
        // next attempt, which then deletes it.
        failed.push({
            filename: track?.name ?? key,
            reason: 'original non supprimé du stockage — relancez la suppression',
        });
    }

    // A track only counts as genuinely `parked` once its original is gone —
    // `notDeletedKeys` is still sitting in the folder, its row and corbeille
    // copy notwithstanding, so it is reported through `failed` above, not here.
    const parked = ok
        .filter((t) => !notDeletedKeys.has(t.key))
        .map((t) => ({
            key: t.key,
            trashId: rowIdByKey.get(t.key)!,
            trashKey: t.trashKey,
            sizeBytes: t.sizeBytes,
        }));

    await prisma.audioTrackEvent.createMany({
        data: ok.map((t) => ({
            bookId,
            action: 'DELETE' as const,
            filename: t.name,
            sizeBytes: BigInt(t.sizeBytes),
            performedById: userId,
        })),
    });

    // --- Per-folder work, done once.
    if (!skipFinalisation) {
        // Removing the last track would otherwise make the folder itself
        // disappear, turning "an admin emptied this" into "this book's path
        // points nowhere".
        //
        // When the caller handed us its pre-mutation listing, the post-
        // mutation remainder is known exactly — everything that listing held
        // MINUS the keys just genuinely removed (copied out AND deleted;
        // `notDeletedKeys` are still sitting in the folder) — so neither call
        // below needs to list the prefix again.
        const removedKeys = new Set(ok.filter((t) => !notDeletedKeys.has(t.key)).map((t) => t.key));
        const remaining = priorObjects?.filter((o) => !removedKeys.has(o.key));
        await ensureFolderPlaceholder(prefix, remaining);
        await refreshBookAudioState(bookId, null, true, remaining);
    }

    return { moved: ok.length, skipped: done.size, failed, parked };
}

/**
 * Move one track to the corbeille and record who did it.
 *
 * A thin single-track wrapper over softDeleteTracks — same copy-verify-
 * delete sequence, same corbeille row, same audit event. The bulk path is
 * the one implementation of that invariant; this just narrates it for the
 * one-track case the audio dialogue's own delete button uses.
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

    const result = await softDeleteTracks({
        bookId,
        prefix: key.slice(0, key.lastIndexOf('/') + 1),
        tracks: [{ key, name: filename, sizeBytes: head.sizeBytes }],
        userId,
    });

    if (result.failed.length) {
        throw new AudioTrashError(result.failed[0].reason);
    }
    if (!result.parked.length) {
        // Resumable by design: a track already recorded in the corbeille
        // (restoredAt: null) is skipped, not re-parked — see the "resume"
        // note above. This single-track path is always a fresh admin
        // action, never a retry of a partial bulk run, so landing here means
        // the file was already moved a moment ago; say so rather than claim
        // to have just done it again.
        throw new AudioTrashError('Ce fichier est déjà dans la corbeille.');
    }

    const { trashId, trashKey, sizeBytes } = result.parked[0];
    return { trashId, trashKey, sizeBytes };
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

    await prisma.audioTrackEvent.create({
        data: {
            bookId: row.bookId,
            action: 'RESTORE',
            filename: row.filename,
            sizeBytes: row.sizeBytes,
            performedById: userId,
        },
    });

    return { bookId: row.bookId, originalKey: row.originalKey };
}
