import 'server-only';

import { prisma } from '@/lib/prisma';
import { copyTrack, deleteTrack, deleteTracks, headTrack, ensureFolderPlaceholder, MAX_COPY_BYTES } from './bucket';
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
 * A track an earlier attempt already copied is not copied twice: its original
 * is recognised as that attempt's leftover (see the resume note in the body)
 * and simply removed, so a call that ran out of time can be made again and
 * continues where it stopped. That is what
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
    if (!ok.length && !leftovers.length) return { moved: 0, skipped: doneKeys.size, failed, parked: [] };

    // --- Record BEFORE removing anything, so a crash between the two leaves a
    //     recoverable trace rather than an orphaned copy nobody can find. Also
    //     required by the foreign key: bookId can only be set while the book row
    //     still exists. *AndReturn so a single-track caller (softDeleteTrack)
    //     can hand back its own trashId without a second query. Leftovers
    //     already have their row.
    const createdRows = ok.length
        ? await prisma.deletedAudioTrack.createManyAndReturn({
              data: ok.map((t) => ({
                  bookId,
                  originalKey: t.key,
                  trashKey: t.trashKey,
                  filename: t.name,
                  sizeBytes: BigInt(t.sizeBytes),
                  deletedById: userId,
              })),
              select: { id: true, originalKey: true },
          })
        : [];
    const rowIdByKey = new Map(createdRows.map((r) => [r.originalKey, r.id]));

    // Everything this call takes out of the folder: the fresh copies and the
    // leftovers, whose copy an earlier attempt already verified.
    const leaving = [
        ...ok.map((t) => ({ key: t.key, name: t.name, sizeBytes: t.sizeBytes, trashKey: t.trashKey, trashId: rowIdByKey.get(t.key)! })),
        ...leftovers,
    ];

    // --- Only now remove the originals, in as few calls as B2 allows.
    const { failed: notDeleted } = await deleteTracks(leaving.map((t) => t.key));
    const notDeletedKeys = new Set(notDeleted);
    for (const key of notDeletedKeys) {
        const track = leaving.find((t) => t.key === key);
        // The copy and the row both exist, so nothing is lost — the original
        // simply outlived the call and is recognised as a leftover by the
        // next attempt, which then deletes it.
        failed.push({
            filename: track?.name ?? key,
            reason: 'original non supprimé du stockage — relancez la suppression',
        });
    }

    // A track only counts as genuinely `parked` once its original is gone —
    // `notDeletedKeys` is still sitting in the folder, its row and corbeille
    // copy notwithstanding, so it is reported through `failed` above, not here.
    const parked = leaving
        .filter((t) => !notDeletedKeys.has(t.key))
        .map((t) => ({
            key: t.key,
            trashId: t.trashId,
            trashKey: t.trashKey,
            sizeBytes: t.sizeBytes,
        }));

    // Leftovers were logged by the attempt that copied them.
    if (ok.length) {
        await prisma.audioTrackEvent.createMany({
            data: ok.map((t) => ({
                bookId,
                action: 'DELETE' as const,
                filename: t.name,
                sizeBytes: BigInt(t.sizeBytes),
                performedById: userId,
            })),
        });
    }

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
        const removedKeys = new Set(parked.map((t) => t.key));
        const remaining = priorObjects?.filter((o) => !removedKeys.has(o.key));
        await ensureFolderPlaceholder(prefix, remaining);
        await refreshBookAudioState(bookId, null, true, remaining);
    }

    return { moved: ok.length, skipped: leftovers.length + doneKeys.size, failed, parked };
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
}

/**
 * Ramène un lot explicite de lignes de corbeille à leur emplacement d'origine,
 * quel que soit leur `bookId` — y compris `null` (le cas « sans-fiche » de
 * /admin/audio-corbeille, où il n'y a justement plus de livre pour filtrer
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
 * tournent en parallèle, les lignes sont mises à jour en un seul updateMany,
 * les copies de corbeille sont supprimées en un seul DeleteObjects, et
 * refreshBookAudioState ne tourne qu'une fois par livre. restoreTrack reste le
 * chemin une-piste, pour le bouton de la boîte de dialogue audio.
 *
 * Mêmes garanties que restoreTrack à l'unité, aux mêmes optimisations que
 * softDeleteTracks : copies vérifiées en parallèle, une seule mise à jour des
 * lignes, une seule suppression groupée des copies de corbeille. L'état audio
 * n'est rafraîchi qu'une fois par livre distinct rencontré parmi les lignes
 * restaurées — un groupe de corbeille n'en tient jamais qu'un seul en
 * pratique (toutes ses lignes partagent le même bookId), mais rien ici ne le
 * suppose.
 */
export async function restoreTracksByIds(opts: {
    trashIds: number[];
    userId: number | null;
}): Promise<BulkRestoreResult> {
    const { trashIds, userId } = opts;
    if (!trashIds.length) return { restored: 0, failed: [] };

    // Purged rows have no copy left to bring back.
    const found = await prisma.deletedAudioTrack.findMany({
        where: { id: { in: trashIds }, restoredAt: null, purgedAt: null },
        select: { id: true, bookId: true, trashKey: true, originalKey: true, filename: true, sizeBytes: true },
        orderBy: { deletedAt: 'desc' },
    });
    if (!found.length) return { restored: 0, failed: [] };

    const failed: BulkRestoreResult['failed'] = [];

    // One row per destination key. A file deleted, re-uploaded under the same
    // name and deleted again leaves two rows naming the same key; restored in
    // parallel, both would pass the « emplacement libre » check before either
    // copied, and the second copy would silently overwrite the first — whose
    // corbeille copy is then deleted as « restored ». The most recent version
    // wins; the older one stays in the corbeille, restorable by hand.
    const rows: typeof found = [];
    const claimedKeys = new Set<string>();
    const prefixByBook = new Map<number, string>();
    for (const row of found) {
        // Avant toute copie — voir restoreDestinationRefusal.
        const wrongFolder = await restoreDestinationRefusal(row.bookId, row.originalKey, prefixByBook);
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

    // --- Copy and verify, in parallel. Nothing in the corbeille is touched yet.
    const copied = await pool(rows, COPY_CONCURRENCY, async (row) => {
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
    });

    const ok = copied.filter((r): r is NonNullable<typeof r> => r !== null);
    if (!ok.length) return { restored: 0, failed };

    await prisma.deletedAudioTrack.updateMany({
        where: { id: { in: ok.map((r) => r.id) } },
        data: { restoredAt: new Date(), restoredById: userId },
    });

    // Best-effort : la ligne est déjà marquée restaurée et l'octet est déjà
    // revenu à sa clé d'origine dans tous les cas — une copie de corbeille
    // qui survit à un DeleteObjects raté est un coût de stockage, pas une
    // perte de données.
    const { failed: notDeleted } = await deleteTracks(ok.map((r) => r.trashKey));
    if (notDeleted.length) {
        console.error('restoreTracksByIds: copies de corbeille non supprimées', notDeleted);
    }

    await prisma.audioTrackEvent.createMany({
        data: ok.map((r) => ({
            bookId: r.bookId,
            action: 'RESTORE' as const,
            filename: r.filename,
            sizeBytes: r.sizeBytes,
            performedById: userId,
        })),
    });

    const distinctBookIds = [...new Set(ok.map((r) => r.bookId).filter((id): id is number => id !== null))];
    await Promise.all(distinctBookIds.map((id) => refreshBookAudioState(id, userId)));

    return { restored: ok.length, failed };
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
 * Une ligne sans livre (`bookId` null, cas « sans-fiche » de
 * /admin/audio-corbeille) n'a pas de dossier auquel se comparer : elle revient à
 * sa clé, comme avant. `findUnique`, pour voir aussi une fiche supprimée — la
 * restauration de la fiche relance justement ses pistes.
 */
async function restoreDestinationRefusal(
    bookId: number | null,
    originalKey: string,
    cache?: Map<number, string>,
): Promise<string | null> {
    if (bookId == null) return null;
    let prefix = cache?.get(bookId);
    if (prefix === undefined) {
        const book = await prisma.book.findUnique({ where: { id: bookId }, select: { audio_filepath: true } });
        prefix = resolvePrefix(book?.audio_filepath);
        cache?.set(bookId, prefix);
    }
    if (prefix && isKeyInsidePrefix(originalKey, prefix)) return null;
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
