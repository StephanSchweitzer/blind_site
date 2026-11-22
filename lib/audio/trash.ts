import 'server-only';

import { prisma } from '@/lib/prisma';
import {
    copyTrack,
    deleteTrack,
    deleteTracks,
    headTrack,
    ensureFolderPlaceholder,
    listRawObjects,
    toOrderedTracks,
    MAX_COPY_BYTES,
} from './bucket';
import { booksSharingAudioFolder, describeSharingBooks, findFolderClaimant } from './sharedFolder';
import { queueOrphanFolder } from './orphanFolders';
import { refreshBookAudioState, resolvePrefix, isKeyInsidePrefix } from './state';
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
 * There is deliberately NO permanent deletion in this module: every action
 * here is reversible. Purging arrived as its own reviewed change, in
 * ./purge.ts — the nightly retention purge and « Supprimer définitivement » —
 * and acts only on corbeille copies, never through the delete path.
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

/**
 * Tracks copied, recorded and removed together before the next ones start —
 * see « Recorded slice by slice » in softDeleteTracks. One concurrency's worth,
 * so a slice costs a single round of copies.
 */
const SLICE_SIZE = COPY_CONCURRENCY;

/**
 * How much older than its corbeille row a file must be to count as the leftover
 * of an interrupted move rather than a new upload under the same name. See the
 * resume note in softDeleteTracks.
 */
export const LEFTOVER_MARGIN_MS = 2 * 60 * 1000;

export interface BulkTrashResult {
    /** Tracks moved to the corbeille by this call. */
    moved: number;
    /** Tracks an earlier interrupted attempt had already moved. */
    skipped: number;
    /** Tracks still sitting in the folder, with why. */
    failed: { filename: string; reason: string }[];
    /**
     * Per-track detail for every track this call took out of the folder —
     * keyed by the original key, so a single-track caller (softDeleteTrack)
     * can pull its own trashId/trashKey back out without a second query.
     * Includes the leftovers of an interrupted attempt that this call finished
     * removing (counted in `skipped`, not `moved`: their copy already existed).
     */
    parked: { key: string; trashId: number; trashKey: string; sizeBytes: number }[];
    /**
     * Tracks this call never started, because `deadline` passed first. They are
     * untouched in the folder — no copy, no row — and the next call picks them
     * up like any other track. Always 0 without a deadline.
     */
    remaining: number;
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
 *   rows are written with createMany, per slice (was two INSERTs per track)
 *   originals go in one DeleteObjects per slice (was one DELETE per track)
 *   placeholder and state refresh happen once   (was twice per track, with listings)
 *
 * A 77-track folder lands at a few dozen sequential steps instead of nine
 * hundred.
 *
 * ## Recorded slice by slice
 *
 * The rows used to be written once, after EVERY copy had finished. A folder too
 * large to copy inside the route's time limit therefore died with hundreds of
 * verified copies in `corbeille/` and not one row naming them: invisible on
 * every screen, never reached by the purge (which only reads rows), and — no
 * row, no leftover — copied all over again by the retry, which died at the same
 * place. « Abysses » (#10275, 228 tracks) did exactly that twice in November
 * 2026: 2 × 217 copies, 3.8 GB, and the folder untouched.
 *
 * So the tracks go SLICE_SIZE at a time, each slice copied, verified, recorded
 * (row and journal entry in one transaction) and removed before the next one
 * starts. A call that dies leaves at most one slice of unrecorded copies; every
 * earlier slice is either finished or recognised as a leftover by the next call.
 *
 * ## Resumable on purpose
 *
 * A track an earlier attempt already copied is not copied twice: its original
 * is recognised as that attempt's leftover (see the resume note in the body)
 * and simply removed, so a call that ran out of time can be made again and
 * continues where it stopped. That is what
 * makes a timeout survivable rather than a half-emptied folder nobody can
 * account for — and it is why the caller must not delete the book until `failed`
 * comes back empty.
 *
 * `deadline` turns « ran out of time » from an accident into a normal answer:
 * no slice starts after it, and the call returns with `remaining` set, the
 * caller's cue to call again. Routes pass one well inside their maxDuration.
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
     *
     * Ignored when the call stops at `deadline` with tracks left: the book is
     * then NOT about to be deleted (its folder still holds tracks), and it may
     * stay that way if nobody calls again — so its state has to say what the
     * folder holds now.
     */
    skipFinalisation?: boolean;
    /**
     * Epoch milliseconds after which no new slice starts. The slice in flight
     * still finishes — copy, record, remove — so the caller's own limit must
     * leave room for one slice plus the finalisation. See `remaining`.
     */
    deadline?: number;
    /**
     * The prefix's complete, unfiltered listing from just before this call —
     * the same shape `listRawObjects` returns. When given, the placeholder
     * check and the state refresh use it (minus whatever this call actually
     * removed) instead of listing the prefix again; the caller usually
     * already has it, from deciding what to pass as `tracks`.
     */
    priorObjects?: { key: string; size: number }[];
    /**
     * Appelé à chaque piste dont le sort est réglé (copiée, en échec, ou déjà
     * faite par une tentative précédente), avec le total à traiter. La copie est
     * la phase longue : c'est elle qui fait avancer la barre de progression.
     */
    onProgress?: (done: number, total: number) => void;
}): Promise<BulkTrashResult> {
    const { bookId, prefix, tracks, userId, skipFinalisation = false, priorObjects, deadline, onProgress } = opts;
    if (!tracks.length) return { moved: 0, skipped: 0, failed: [], parked: [], remaining: 0 };

    const failed: BulkTrashResult['failed'] = [];

    // --- Resume: finish what an interrupted attempt left behind.
    //
    // A corbeille row naming this key is NOT enough to call the file « already
    // done ». The row outlives the deletion for 14 days (and forever for the
    // retainForever backfill), so a file deleted, re-recorded and re-uploaded
    // under the same name matched it too: the new file could then never be
    // deleted (« déjà dans la corbeille »), and a mis-sized re-upload stayed in
    // the folder while the commit route reported it moved.
    //
    // A leftover is the parked object itself, still sitting in the folder
    // because the attempt that copied it stopped before removing it: same
    // size, last written well BEFORE the row was created (LEFTOVER_MARGIN_MS),
    // with its corbeille copy still present. Anything else under that key is a new file and is moved
    // like any other, into a fresh corbeille row. A leftover's original is
    // removed now — its verified copy already exists — which is what « the
    // next attempt deletes it » below has always promised.
    const already = await prisma.deletedAudioTrack.findMany({
        where: {
            bookId,
            restoredAt: null,
            purgedAt: null,
            originalKey: { in: tracks.map((t) => t.key) },
        },
        select: { id: true, originalKey: true, trashKey: true, sizeBytes: true, deletedAt: true },
        orderBy: { deletedAt: 'desc' },
    });
    const parkedByKey = new Map<string, (typeof already)[number]>();
    for (const row of already) {
        if (!parkedByKey.has(row.originalKey)) parkedByKey.set(row.originalKey, row);
    }

    const leftovers: { key: string; name: string; sizeBytes: number; trashId: number; trashKey: string }[] = [];
    const leftoverKeys = new Set<string>();
    // Already parked AND already gone from the folder: nothing left to do. The
    // caller's listing can still show a key B2 has just removed (its LIST lags
    // behind a delete), so a retry built from a fresh listing lands here too.
    const doneKeys = new Set<string>();
    if (parkedByKey.size) {
        await pool(
            tracks.filter((t) => parkedByKey.has(t.key)),
            COPY_CONCURRENCY,
            async (track) => {
                const row = parkedByKey.get(track.key)!;
                try {
                    const original = await headTrack(track.key);
                    if (!original) {
                        doneKeys.add(track.key);
                        return;
                    }
                    if (Number(row.sizeBytes) !== track.sizeBytes) return;
                    // Two clocks meet here — B2's lastModified, Postgres' deletedAt —
                    // and the two ways of being wrong are not equal: a leftover
                    // taken for a new file costs one extra corbeille copy, a new
                    // file taken for a leftover would be removed with no copy of
                    // its own. Hence a margin far beyond any clock skew.
                    const writtenBeforeRow =
                        !!original.lastModified &&
                        original.lastModified.getTime() < row.deletedAt.getTime() - LEFTOVER_MARGIN_MS;
                    if (!writtenBeforeRow) return;
                    const copy = await headTrack(row.trashKey);
                    if (copy?.sizeBytes === track.sizeBytes) {
                        leftovers.push({ ...track, trashId: row.id, trashKey: row.trashKey });
                        leftoverKeys.add(track.key);
                    }
                } catch (e) {
                    // Undecidable: treated as a new file below, which costs a
                    // second copy at worst and never removes an uncopied original.
                    console.error('softDeleteTracks: reprise non vérifiable', track.key, e);
                }
            },
        );
    }

    const todo = tracks.filter((t) => !leftoverKeys.has(t.key) && !doneKeys.has(t.key));

    // Une reprise part de ce que la tentative précédente a déjà réglé.
    let settled = tracks.length - todo.length;
    onProgress?.(settled, tracks.length);

    // --- Leftovers first: their copy and row already exist, an earlier
    //     attempt verified both, and only the original is left to remove.
    const parked: BulkTrashResult['parked'] = [];
    let moved = 0;
    if (leftovers.length) {
        await removeOriginals(leftovers);
    }

    // --- Then slice by slice: copy and verify, record, remove. Nothing from a
    //     slice is destroyed before its rows exist, and no slice starts before
    //     the previous one is fully settled — see « Recorded slice by slice ».
    let next = 0;
    while (next < todo.length) {
        if (deadline !== undefined && Date.now() >= deadline) break;
        const slice = todo.slice(next, next + SLICE_SIZE);
        next += slice.length;

        const copied = await pool(slice, COPY_CONCURRENCY, async (track) => {
            try {
                return await copyOne(track);
            } finally {
                settled += 1;
                onProgress?.(settled, tracks.length);
            }
        });
        const ok = copied.filter((c): c is NonNullable<typeof c> => c !== null);
        if (!ok.length) continue;

        // Record BEFORE removing anything, so a crash between the two leaves a
        // recoverable trace rather than an orphaned copy nobody can find. Also
        // required by the foreign key: bookId can only be set while the book row
        // still exists. *AndReturn so a single-track caller (softDeleteTrack)
        // can hand back its own trashId without a second query.
        //
        // The journal entry goes in the same transaction. It used to follow the
        // removal, so a call that died in between left a row with no entry — and
        // the next call, finding a leftover, rightly logs nothing (« logged by
        // the attempt that copied them »), so the entry was lost for good.
        const createdRows = await prisma.$transaction(async (tx) => {
            const rows = await tx.deletedAudioTrack.createManyAndReturn({
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
            await tx.audioTrackEvent.createMany({
                data: ok.map((t) => ({
                    bookId,
                    action: 'DELETE' as const,
                    filename: t.name,
                    sizeBytes: BigInt(t.sizeBytes),
                    performedById: userId,
                })),
            });
            return rows;
        });
        const rowIdByKey = new Map(createdRows.map((r) => [r.originalKey, r.id]));
        moved += ok.length;

        const removed = await removeOriginals(
            ok.map((t) => ({
                key: t.key,
                name: t.name,
                sizeBytes: t.sizeBytes,
                trashKey: t.trashKey,
                trashId: rowIdByKey.get(t.key)!,
            })),
        );
        // B2 refused the removal outright: the next slice would only pile more
        // recorded-but-not-removed originals on top. Stop here; the untouched
        // tracks come back as `remaining`, and the next call finishes these as
        // leftovers.
        if (!removed) break;
    }
    const remaining = todo.length - next;

    async function copyOne(track: (typeof todo)[number]) {
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
    }

    /**
     * Remove originals whose verified copy AND row already exist, in as few
     * calls as B2 allows. Returns false when the DeleteObjects call itself
     * failed, rather than answering per key.
     */
    async function removeOriginals(
        leaving: { key: string; name: string; sizeBytes: number; trashKey: string; trashId: number }[],
    ): Promise<boolean> {
        let notDeleted: string[];
        let reachable = true;
        try {
            notDeleted = (await deleteTracks(leaving.map((t) => t.key))).failed;
        } catch (e) {
            console.error('softDeleteTracks: suppression des originaux refusée', e);
            notDeleted = leaving.map((t) => t.key);
            reachable = false;
        }
        const notDeletedKeys = new Set(notDeleted);
        for (const t of leaving) {
            if (notDeletedKeys.has(t.key)) {
                // The copy and the row both exist, so nothing is lost — the
                // original simply outlived the call and is recognised as a
                // leftover by the next attempt, which then deletes it.
                failed.push({
                    filename: t.name,
                    reason: 'original non supprimé du stockage — relancez la suppression',
                });
            } else {
                // A track only counts as genuinely `parked` once its original
                // is gone; the others are reported through `failed` above.
                parked.push({ key: t.key, trashId: t.trashId, trashKey: t.trashKey, sizeBytes: t.sizeBytes });
            }
        }
        return reachable;
    }

    // --- Per-folder work, done once — and only if the folder changed.
    if (parked.length && (!skipFinalisation || remaining > 0)) {
        // Removing the last track would otherwise make the folder itself
        // disappear, turning "an admin emptied this" into "this book's path
        // points nowhere".
        //
        // When the caller handed us its pre-mutation listing, the post-
        // mutation remainder is known exactly — everything that listing held
        // MINUS the keys just genuinely removed (copied out AND deleted;
        // originals B2 refused to delete are still sitting in the folder) —
        // so neither call below needs to list the prefix again.
        const removedKeys = new Set(parked.map((t) => t.key));
        const left = priorObjects?.filter((o) => !removedKeys.has(o.key));
        const placed = await ensureFolderPlaceholder(prefix, left);
        // The placeholder just written belongs in that remainder too: handed an
        // empty listing, the refresh reads « nothing at this path » and writes
        // FOLDER_MISSING — the very answer the placeholder exists to prevent.
        // (It did, every time the caller's listing held no `.bzEmpty` of its own.)
        await refreshBookAudioState(
            bookId,
            null,
            true,
            left && placed ? [...left, { key: `${prefix}.bzEmpty`, size: 0 }] : left,
        );
    }

    return { moved, skipped: leftovers.length + doneKeys.size, failed, parked, remaining };
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
        // `reason` est un fragment (« copie vers la corbeille impossible ») écrit
        // pour la liste d'échecs du retrait en masse ; seul dans un toast, il ne
        // disait pas ce qui avait échoué.
        throw new AudioTrashError(
            `Impossible de déplacer ce fichier dans la corbeille : ${result.failed[0].reason}.`,
        );
    }
    if (!result.parked.length) {
        // Defensive: a track that is neither parked nor failed should not
        // exist. Say what is known rather than claim a move that didn't happen.
        throw new AudioTrashError('Ce fichier est déjà dans la corbeille.');
    }

    const { trashId, trashKey, sizeBytes } = result.parked[0];
    return { trashId, trashKey, sizeBytes };
}

export interface BulkRestoreResult {
    /** Pistes ramenées à leur emplacement d'origine par cet appel. */
    restored: number;
    /** Pistes restées en corbeille, avec pourquoi. */
    failed: { filename: string; reason: string }[];
    /**
     * Lignes que cet appel n'a pas commencées, parce que `deadline` est passé :
     * intactes (copie toujours en corbeille, ligne active), à repasser telles
     * quelles à l'appel suivant. Toujours vide sans délai.
     */
    remainingIds: number[];
}

/**
 * Ramène un lot explicite de lignes de corbeille à leur emplacement d'origine,
 * quel que soit leur `bookId` — y compris `null` (une ligne « fiche supprimée »
 * de /admin/audio-corbeille, où il n'y a justement plus de livre pour filtrer
 * dessus). Le pendant, côté restauration, de softDeleteTracks.
 *
 * Un lot explicite, jamais « tout ce que la corbeille tient pour ce livre » :
 * elle garde aussi les prises ratées qu'un permanent a retirées exprès, des
 * semaines avant. POST /api/books/[id]/restore passe donc les pistes que le
 * permanent a choisi de ramener avec la fiche, et rien d'autre.
 *
 * Boucler sur restoreTrack coûterait par piste ce que softDeleteTracks
 * refusait de payer à la suppression (HEAD, HEAD, COPY, UPDATE, DELETE, et un
 * refreshBookAudioState — donc une LIST complète du dossier) : ici les copies
 * tournent en parallèle, les lignes et le journal s'écrivent par tranche, les
 * copies de corbeille partent en un DeleteObjects par tranche, et l'état audio
 * n'est relu qu'une fois par dossier touché (settleRestoredFolders).
 *
 * ## Par tranches, comme la suppression
 *
 * Les lignes n'étaient marquées « restaurées » qu'une fois TOUTES les copies
 * faites. Coupé par le délai de la route au milieu d'un gros dossier, l'appel
 * laissait des pistes revenues dans le dossier mais toujours « en corbeille » à
 * l'écran — et la relance les refusait une à une, l'emplacement étant occupé…
 * par elles. Désormais chaque tranche de SLICE_SIZE est copiée, vérifiée, puis
 * enregistrée (ligne et journal dans une transaction) avant la suivante ; une
 * interruption n'en laisse qu'une seule en suspens. `deadline` arrête de lancer
 * des tranches et rend le reste dans `remainingIds`.
 */
export async function restoreTracksByIds(opts: {
    trashIds: number[];
    userId: number | null;
    /** Epoch ms après lequel plus aucune tranche ne démarre. Voir `remainingIds`. */
    deadline?: number;
}): Promise<BulkRestoreResult> {
    const { trashIds, userId, deadline } = opts;
    if (!trashIds.length) return { restored: 0, failed: [], remainingIds: [] };

    // Purged rows have no copy left to bring back.
    const found = await prisma.deletedAudioTrack.findMany({
        where: { id: { in: trashIds }, restoredAt: null, purgedAt: null },
        select: {
            id: true,
            bookId: true,
            trashKey: true,
            originalKey: true,
            filename: true,
            sizeBytes: true,
            originBookTitle: true,
        },
        orderBy: { deletedAt: 'desc' },
    });
    if (!found.length) return { restored: 0, failed: [], remainingIds: [] };

    const failed: BulkRestoreResult['failed'] = [];

    // One row per destination key. A file deleted, re-uploaded under the same
    // name and deleted again leaves two rows naming the same key; restored in
    // parallel, both would pass the « emplacement libre » check before either
    // copied, and the second copy would silently overwrite the first — whose
    // corbeille copy is then deleted as « restored ». The most recent version
    // wins; the older one stays in the corbeille, restorable by hand.
    const rows: typeof found = [];
    const claimedKeys = new Set<string>();
    const folderByBook: DestinationCache = new Map();
    for (const row of found) {
        // Avant toute copie — voir restoreDestinationRefusal.
        const wrongFolder = await restoreDestinationRefusal(row.bookId, row.originalKey, folderByBook);
        if (wrongFolder) {
            failed.push({ filename: row.filename, reason: wrongFolder });
            continue;
        }
        if (claimedKeys.has(row.originalKey)) {
            failed.push({
                filename: row.filename,
                reason: 'une version plus récente du même fichier est restaurée à sa place',
            });
            continue;
        }
        claimedKeys.add(row.originalKey);
        rows.push(row);
    }

    const copyBack = async (row: (typeof rows)[number]) => {
        // Tout sous le try, les HEAD compris : B2 répond une part de ses
        // requêtes en 5xx, et une seule exception sortie d'ici abandonnait le
        // lot entier — lignes déjà recopiées comprises, jamais marquées
        // restaurées.
        try {
            const inTrash = await headTrack(row.trashKey);
            if (!inTrash) {
                failed.push({
                    filename: row.filename,
                    reason: 'copie de sauvegarde introuvable dans la corbeille',
                });
                return null;
            }
            // Même refus qu'à l'unité : un fichier peut avoir été redéposé sous
            // cette clé pendant que le livre était supprimé — l'écraser détruirait
            // un enregistrement en semblant en restaurer un autre.
            const occupied = await headTrack(row.originalKey);
            if (occupied) {
                failed.push({
                    filename: row.filename,
                    reason: 'un fichier occupe déjà cet emplacement — restauration annulée pour ne pas l’écraser',
                });
                return null;
            }
            await copyTrack(row.trashKey, row.originalKey);
            const restored = await headTrack(row.originalKey);
            if (!restored || restored.sizeBytes !== Number(row.sizeBytes)) {
                failed.push({ filename: row.filename, reason: 'restauration non vérifiable' });
                return null;
            }
            return row;
        } catch (e) {
            console.error('restoreTracksByIds: copie impossible', row.originalKey, e);
            failed.push({ filename: row.filename, reason: 'copie depuis la corbeille impossible' });
            return null;
        }
    };

    const done: (typeof rows)[number][] = [];
    let next = 0;
    while (next < rows.length) {
        if (deadline !== undefined && Date.now() >= deadline) break;
        const slice = rows.slice(next, next + SLICE_SIZE);
        next += slice.length;

        // --- Copy and verify, in parallel. Nothing in the corbeille is touched yet.
        const ok = (await pool(slice, COPY_CONCURRENCY, copyBack)).filter(
            (r): r is NonNullable<typeof r> => r !== null,
        );
        if (!ok.length) continue;

        // --- Record: the row and its journal entry together, before the
        //     corbeille copy goes.
        await prisma.$transaction([
            prisma.deletedAudioTrack.updateMany({
                where: { id: { in: ok.map((r) => r.id) }, restoredAt: null },
                data: { restoredAt: new Date(), restoredById: userId },
            }),
            prisma.audioTrackEvent.createMany({
                data: ok.map((r) => ({
                    bookId: r.bookId,
                    action: 'RESTORE' as const,
                    filename: r.filename,
                    sizeBytes: r.sizeBytes,
                    performedById: userId,
                })),
            }),
        ]);
        done.push(...ok);

        // Best-effort : la ligne est déjà marquée restaurée et l'octet est déjà
        // revenu à sa clé d'origine dans tous les cas — une copie de corbeille
        // qui survit à un DeleteObjects raté est un coût de stockage, pas une
        // perte de données.
        try {
            const { failed: notDeleted } = await deleteTracks(ok.map((r) => r.trashKey));
            if (notDeleted.length) {
                console.error('restoreTracksByIds: copies de corbeille non supprimées', notDeleted);
            }
        } catch (e) {
            console.error('restoreTracksByIds: copies de corbeille non supprimées', e);
        }
    }

    if (done.length) await settleRestoredFolders(done, userId);

    return { restored: done.length, failed, remainingIds: rows.slice(next).map((r) => r.id) };
}

/**
 * Après une restauration : dire au catalogue ce que les dossiers touchés
 * contiennent maintenant.
 *
 * Une ligne rattachée à un livre relit ce livre. Une ligne sans livre (« fiche
 * supprimée ») revient dans un dossier que personne ne relisait :
 *  - si une fiche le revendique aujourd'hui (dossier rattaché depuis, fiche
 *    recréée), c'est elle qui vient de gagner des pistes — on la relit ;
 *  - sinon le dossier rejoint la file d'Audio orphelin. L'écran et le mode
 *    d'emploi le promettaient, mais seul le script de synchronisation, lancé à
 *    la main, alimentait cette file : le dossier restauré n'apparaissait nulle part.
 *
 * Jamais bloquant : les pistes sont revenues et enregistrées comme telles
 * avant d'arriver ici ; un échec ne coûte qu'un état à relire plus tard.
 */
async function settleRestoredFolders(
    rows: { bookId: number | null; originalKey: string; originBookTitle: string | null }[],
    userId: number | null,
): Promise<void> {
    const bookIds = new Set<number>();
    const orphanFolders = new Map<string, string | null>();
    for (const r of rows) {
        if (r.bookId != null) {
            bookIds.add(r.bookId);
        } else {
            const folder = r.originalKey.slice(0, r.originalKey.lastIndexOf('/') + 1);
            if (!orphanFolders.has(folder)) orphanFolders.set(folder, r.originBookTitle);
        }
    }
    try {
        for (const [folder, title] of orphanFolders) {
            const claimant = await findFolderClaimant(folder);
            if (claimant) {
                bookIds.add(claimant.id);
                continue;
            }
            const tracks = toOrderedTracks(await listRawObjects(folder), folder);
            await queueOrphanFolder({
                prefix: folder,
                title: title ?? folder.replace(/\/$/, '').split('/').pop() ?? folder,
                trackCount: tracks.length,
                bytes: tracks.reduce((s, t) => s + t.sizeBytes, 0),
                note: 'pistes restaurées depuis la corbeille, sans fiche pour les recevoir',
            });
        }
        for (const id of bookIds) await refreshBookAudioState(id, userId);
    } catch (e) {
        console.error('settleRestoredFolders: état audio non relu', [...bookIds], [...orphanFolders.keys()], e);
    }
}


/**
 * Inscrit sur les lignes de corbeille d'un livre QUI il était, juste avant que
 * sa fiche disparaisse.
 *
 * `DeletedAudioTrack.bookId` est `onDelete: SetNull` — la corbeille survit à la
 * fiche, ce qui est voulu — mais son seul lecteur (GET
 * /api/books/[id]/audio/trash) filtre sur `bookId`. Une piste envoyée à la
 * corbeille depuis l'éditeur audio, puis dont la fiche était supprimée, ne
 * s'affichait donc plus nulle part, alors que purgeExpiredAudioTrash
 * (./purge.ts) efface l'objet pour de bon au bout de 14 jours sans regarder ce
 * null : « le livre supprimé laisse ses enregistrements récupérables » était
 * faux dès qu'on passait par le back-office.
 *
 * Le journal d'audit ne rattrapait rien : il se purge à 14 jours lui aussi
 * (7 sous pression), donc dans la même fenêtre ou moins.
 *
 * À appeler depuis TOUT chemin qui supprime une ligne Book, pendant qu'elle
 * existe encore (la route DELETE du livre, la suppression depuis Doublons,
 * scripts/delete-duplicate-book.ts). Les lignes restent lisibles et
 * restaurables depuis /admin/audio-corbeille.
 *
 * Une fusion ne passe PAS par ici : elle réattribue les lignes au livre
 * survivant, comme elle réattribue les demandes et les attributions — le
 * travail est le même ouvrage, donc la corbeille de la fiche conservée est le
 * bon endroit (voir fuseBooks).
 */
export async function markTrashOrigin(bookId: number, title: string): Promise<number> {
    const { count } = await prisma.deletedAudioTrack.updateMany({
        where: { bookId },
        data: { originBookId: bookId, originBookTitle: title },
    });
    return count;
}


/** Dossier revendiqué par une fiche, et le refus éventuel qui en découle. */
type DestinationCache = Map<number, { prefix: string; shared: string | null }>;

/**
 * Une piste ne revient que dans le dossier que sa fiche revendique AUJOURD'HUI.
 *
 * La restauration recopie vers `originalKey`, la clé d'où la piste est partie.
 * Mais le dossier a pu changer de fiche entre-temps : après une suppression
 * « transférer » (deleteBookWithAudio), le dossier de A appartient à B et A n'en
 * a plus aucun ; après une fusion, les lignes réattribuées au survivant peuvent
 * nommer le dossier du doublon absorbé. Restaurer y déposait la piste quand
 * même — dans l'enregistrement d'un AUTRE livre (son poids, sa durée, son ordre
 * de lecture, son tarif), ou dans un dossier que plus aucune fiche ne lit, alors
 * que l'écran annonçait une restauration réussie.
 *
 * Même chose pour un dossier PARTAGÉ avec une autre fiche vivante : la
 * suppression et le renommage y sont refusés (lib/audio/sharedFolder.ts), la
 * restauration y ajoutait une piste à l'enregistrement du jumeau sans relire
 * son état.
 *
 * Une ligne sans livre (`bookId` null, « fiche supprimée » sur
 * /admin/audio-corbeille) n'a pas de dossier auquel se comparer : elle revient à
 * sa clé, et settleRestoredFolders dit ensuite au catalogue où elle est
 * arrivée. `findUnique`, pour voir aussi une fiche supprimée — la restauration
 * de la fiche relance justement ses pistes.
 */
async function restoreDestinationRefusal(
    bookId: number | null,
    originalKey: string,
    cache?: DestinationCache,
): Promise<string | null> {
    if (bookId == null) return null;
    let entry = cache?.get(bookId);
    if (entry === undefined) {
        const book = await prisma.book.findUnique({ where: { id: bookId }, select: { audio_filepath: true } });
        const prefix = resolvePrefix(book?.audio_filepath);
        const sharing = prefix ? await booksSharingAudioFolder(bookId, prefix) : [];
        entry = {
            prefix,
            shared: sharing.length
                ? `le dossier audio est aussi celui de ${describeSharingBooks(sharing)} : la piste ` +
                  `s’ajouterait à ${sharing.length > 1 ? 'leur' : 'son'} enregistrement`
                : null,
        };
        cache?.set(bookId, entry);
    }
    const { prefix, shared } = entry;
    if (prefix && isKeyInsidePrefix(originalKey, prefix)) return shared;
    return prefix
        ? 'la fiche a changé de dossier audio depuis la suppression : la piste reviendrait dans un dossier qui n’est plus le sien'
        : 'la fiche n’a plus de dossier audio (transféré à un autre livre ?) : la piste reviendrait dans l’enregistrement d’un autre';
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
    if (row.purgedAt) {
        throw new AudioTrashError('Ce fichier a été supprimé définitivement : il ne peut plus être restauré.');
    }

    const wrongFolder = await restoreDestinationRefusal(row.bookId, row.originalKey);
    if (wrongFolder) {
        throw new AudioTrashError(`Restauration refusée : ${wrongFolder}.`);
    }

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

    // The row and its journal entry together: the track IS back from here on.
    await prisma.$transaction([
        prisma.deletedAudioTrack.update({
            where: { id: trashId },
            data: { restoredAt: new Date(), restoredById: userId },
        }),
        prisma.audioTrackEvent.create({
            data: {
                bookId: row.bookId,
                action: 'RESTORE',
                filename: row.filename,
                sizeBytes: row.sizeBytes,
                performedById: userId,
            },
        }),
    ]);

    // The corbeille copy is only removed once the original is verifiably back —
    // and best-effort, as in restoreTracksByIds: failing here used to report a
    // completed restore as failed, with the journal and the state left unwritten.
    try {
        await deleteTrack(row.trashKey);
    } catch (e) {
        console.error('restoreTrack: copie de corbeille non supprimée', row.trashKey, e);
    }

    await settleRestoredFolders([row], userId);

    return { bookId: row.bookId, originalKey: row.originalKey };
}
