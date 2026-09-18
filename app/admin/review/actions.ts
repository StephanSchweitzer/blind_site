'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { asAdmin, type CurrentUser } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { refreshBookAudioState } from '@/lib/audio/state';
import { isDoubleRecording } from '@/lib/audio-enums';
import { sendReviewEscalation } from '@/lib/email/sendReviewEscalation';
import { getUserDisplayName } from '@/lib/users/displayName';
import { deleteBookWithAudio } from '@/lib/books/deleteBookWithAudio';
import { unexpectedErrorResult } from '@/lib/api-errors';

/**
 * `unexpected` + `ref` : l'échec n'a pas de cause connue — le toast le dit et
 * donne à qui écrire, avec la référence journalisée (voir unexpectedErrorResult).
 */
export type ActionResult =
    | { ok: true; message: string }
    | { ok: false; message: string; unexpected?: true; ref?: string };

const DENIED: ActionResult = { ok: false, message: 'Permissions insuffisantes' };

/**
 * Every action here runs through this rather than resolving the session itself:
 * it is what puts the permanent's name on the writes below. A fusion deletes a
 * book and repoints demandes — « par Système » is not an acceptable trace for
 * that. See asAdmin in lib/auth/guards.ts for why the ambient variant failed.
 */
const asAdminAction = (body: (me: CurrentUser) => Promise<ActionResult>) => asAdmin(DENIED, body);

// Scalars the permanent may choose to pull from the removed book onto the survivor.
// audio_filepath is deliberately NOT here — it's auto-handled (always kept; a genuine
// two-recording conflict blocks the whole merge). source_access_id/id_arbre are identity.
const OVERRIDABLE_FIELDS = [
    'title',
    'author',
    'subtitle',
    'publishedDate',
    'isbn',
    'publisher',
    'pageCount',
    'readingDurationMinutes',
    'description',
] as const;

const OVERRIDABLE = new Set<string>(OVERRIDABLE_FIELDS);

/**
 * Which side's audio folder should the fused record point at — and is this pair
 * a genuine double recording that must not be merged at all?
 *
 * POURQUOI RELIRE LE BUCKET
 *
 * The guard exists to protect a recording from being orphaned by a merge, and
 * the audio columns are only a CACHE of what the bucket holds. Refusing on a
 * stale cache blocks a legitimate merge over a bookkeeping lag; merging on one
 * strands a real recording. Neither is acceptable, so both folders are re-read
 * before the question is answered — and the re-read repairs the cached columns
 * on the way through, which is what keeps the card the permanent is looking at
 * honest afterwards.
 *
 * The cost is two bucket listings on an action a permanent takes deliberately,
 * a handful of times a day. That is the right price for a decision that deletes
 * a row.
 *
 * POURQUOI CE N'EST PLUS « DEUX CHEMINS DIFFÉRENTS »
 *
 * It used to be. Any two differing path strings counted as two recordings, so an
 * upload made to the wrong side of a duplicate pair — which creates a folder on
 * a record that had none — permanently froze the pair: fusion AND both delete
 * buttons disabled, with nothing in the queue able to resolve it. A path at an
 * empty or vanished folder is a dead pointer, not a recording, and the merge
 * should simply keep the live one.
 *
 * A bucket that cannot be reached fails CLOSED: unknown is not permission to
 * delete a row that might be the only record of a recording.
 */
async function resolveAudioSide(
    survivorId: number,
    removedId: number,
): Promise<'survivor' | 'removed'> {
    const [survivor, removed] = await Promise.all([
        prisma.book.findUnique({
            where: { id: survivorId },
            select: { audio_filepath: true },
        }),
        prisma.book.findUnique({
            where: { id: removedId },
            select: { audio_filepath: true },
        }),
    ]);

    const sPath = survivor?.audio_filepath?.trim() || null;
    const rPath = removed?.audio_filepath?.trim() || null;

    // Nothing to arbitrate, and no reason to pay for two listings: at most one
    // side points anywhere, or both point at the same folder.
    if (!rPath) return 'survivor';
    if (!sPath) return 'removed';
    if (sPath === rPath) return 'survivor';

    let sState;
    let rState;
    try {
        [sState, rState] = await Promise.all([
            refreshBookAudioState(survivorId),
            refreshBookAudioState(removedId),
        ]);
    } catch (error) {
        console.error('resolveAudioSide: bucket unreachable', error);
        throw new Error('AUDIO_UNVERIFIABLE');
    }

    const sHolds = (sState.trackCount ?? 0) > 0;
    const rHolds = (rState.trackCount ?? 0) > 0;

    if (sHolds && rHolds) throw new Error('AUDIO_CONFLICT');
    // One live folder and one dead pointer: keep the live one. If neither holds
    // anything, both paths are dead and the survivor's is as good as the other.
    return rHolds ? 'removed' : 'survivor';
}

/**
 * FUSE: merge the removed book into the survivor, in a single transaction.
 * `overrides` lists the fields whose value should be taken FROM the removed book
 * (everything else keeps the survivor's value). Reassigns relations, applies the
 * chosen fields, always preserves an audio path, deletes the removed book, clears
 * the review flag, and appends an immutable BookMergeEvent with a snapshot.
 */
export async function fuseBooks(
    survivorId: number,
    removedId: number,
    overrides: string[] = [],
    /**
     * Ce que l'import avait rapproché, quand le permanent a mis un autre livre en
     * face. Sert uniquement à la trace : le rapprochement de l'import est un
     * indice faillible, et une fusion faite contre son avis est précisément celle
     * qu'on voudra pouvoir relire plus tard.
     */
    proposedMatchId: number | null = null
): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        if (!Number.isInteger(survivorId) || !Number.isInteger(removedId)) {
            return { ok: false, message: 'Identifiants invalides' };
        }
        if (survivorId === removedId) {
            return { ok: false, message: 'Un livre ne peut pas être fusionné avec lui-même' };
        }

        const fields = [...new Set(overrides)].filter((f) => OVERRIDABLE.has(f));

        // Posé à la fin de la transaction : après, une exception ne peut plus se
        // dire « aucune modification enregistrée ».
        let committed = false;
        try {
            // Settled BEFORE the transaction, because deciding it reaches the
            // bucket and refreshBookAudioState must not run inside one.
            const keepAudioFrom = await resolveAudioSide(survivorId, removedId);

            await prisma.$transaction(async (tx) => {
                const survivor = await tx.book.findUnique({ where: { id: survivorId } });
                const removed = await tx.book.findUnique({ where: { id: removedId } });
                if (!survivor) throw new Error('SURVIVOR_NOT_FOUND');
                if (!removed) throw new Error('REMOVED_NOT_FOUND');

                // 1. Reassign relations off the removed book onto the survivor.
                //    Assignment/Orders reference the book via `catalogueId` (no unique constraint).
                await tx.assignment.updateMany({ where: { catalogueId: removedId }, data: { catalogueId: survivorId } });
                await tx.orders.updateMany({ where: { catalogueId: removedId }, data: { catalogueId: survivorId } });

                // BookGenre PK is (bookId, genreId): drop removed rows the survivor already has, move the rest.
                const keepGenres = await tx.bookGenre.findMany({ where: { bookId: survivorId }, select: { genreId: true } });
                await tx.bookGenre.deleteMany({
                    where: { bookId: removedId, genreId: { in: keepGenres.map((g) => g.genreId) } },
                });
                await tx.bookGenre.updateMany({ where: { bookId: removedId }, data: { bookId: survivorId } });

                // CoupsDeCoeurBooks PK is (coupsDeCoeurId, bookId): same de-dup then move.
                const keepLists = await tx.coupsDeCoeurBooks.findMany({ where: { bookId: survivorId }, select: { coupsDeCoeurId: true } });
                await tx.coupsDeCoeurBooks.deleteMany({
                    where: { bookId: removedId, coupsDeCoeurId: { in: keepLists.map((c) => c.coupsDeCoeurId) } },
                });
                await tx.coupsDeCoeurBooks.updateMany({ where: { bookId: removedId }, data: { bookId: survivorId } });

                // La corbeille audio du doublon suit, elle aussi. `bookId` est
                // onDelete: SetNull et son unique écran filtre sur lui : sans ce
                // déplacement, une piste supprimée depuis la fiche absorbée
                // devenait invisible partout, puis était purgée pour de bon au
                // bout de 14 jours. Réattribuée plutôt que juste étiquetée (voir
                // markTrashOrigin, pour les suppressions sans survivant) : c'est
                // le même ouvrage, donc la corbeille de la fiche conservée est le
                // bon endroit. Les clés d'origine peuvent nommer le dossier du
                // doublon — la ligne les affiche, donc cela reste lisible.
                await tx.deletedAudioTrack.updateMany({
                    where: { bookId: removedId },
                    data: { bookId: survivorId },
                });

                // 2. Snapshot + delete the removed book BEFORE writing scalars onto the survivor,
                //    so pulling the removed book's @unique isbn can't collide with the still-live row.
                // `pairing` dit qui a décidé que ces deux fiches allaient ensemble.
                // BookMergeEvent est append-only et c'est la seule trace qui restera
                // du couple : sans ce champ, une fusion faite contre le rapprochement
                // de l'import est indistinguable d'une fusion qui l'a suivi.
                // `null` = l'import n'avait rien trouvé, donc le couple vient aussi
                // du permanent. Seule l'égalité stricte vaut « c'est l'import ».
                const manual = proposedMatchId !== removedId;
                const snapshot = {
                    removedBook: JSON.parse(JSON.stringify(removed)),
                    overrides: fields,
                    pairing: manual ? 'manual' : 'import',
                    ...(manual ? { proposedMatchId } : {}),
                } as unknown as Prisma.InputJsonValue;
                await tx.book.delete({ where: { id: removedId } });

                // 3. Apply the chosen field overrides onto the survivor, keep whichever
                //    folder actually holds the recording, clear the review flag.
                const data: Prisma.BookUpdateInput = { needsReview: false, id_arbre: null };
                for (const f of fields) {
                    (data as Record<string, unknown>)[f] = (removed as Record<string, unknown>)[f];
                }
                if (keepAudioFrom === 'removed') {
                    data.audio_filepath = removed.audio_filepath;
                    // audioLinkStatus/audioTrackCount/audioSizeKb describe the *folder*, so the reading
                    // taken on the removed record is already the right one for the survivor.
                    // Copying it means the fused fiche shows its audio badge as soon as the
                    // page refreshes, instead of keeping the survivor's stale « pas d'audio »
                    // until the bucket re-read below (or the next nightly sync) lands.
                    data.audioLinkStatus = removed.audioLinkStatus;
                    data.audioTrackCount = removed.audioTrackCount;
                    data.audioSizeKb = removed.audioSizeKb;
                    data.audioCheckedAt = removed.audioCheckedAt;
                }

                await tx.book.update({ where: { id: survivorId }, data });

                // 4. Append-only audit entry.
                await tx.bookMergeEvent.create({
                    data: { canonicalId: survivorId, duplicateId: removedId, snapshot, performedById: me.id },
                });
            });
            committed = true;

            // The audio columns are a cache of the bucket, and a fusion can hand the
            // survivor a folder it never pointed at. Re-read it now so every badge that
            // reads those columns — la file, le catalogue, l'éditeur audio — is right
            // immediately rather than after someone opens the editor by hand.
            // Best effort: the merge is committed, a bucket outage must not report it failed.
            try {
                await refreshBookAudioState(survivorId);
            } catch (error) {
                console.error('fuseBooks: audio state refresh failed for book', survivorId, error);
            }

            revalidateAdmin();
            revalidateCatalogue();
            return { ok: true, message: 'Livres fusionnés avec succès' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : '';
            const map: Record<string, string> = {
                SURVIVOR_NOT_FOUND: 'Le livre à conserver est introuvable',
                REMOVED_NOT_FOUND: 'Le doublon est introuvable',
                AUDIO_CONFLICT:
                    'Double enregistrement audio : la fusion est bloquée. Ce doublon nécessite une vérification manuelle.',
                AUDIO_UNVERIFIABLE:
                    'Le stockage est injoignable : impossible de vérifier les enregistrements des deux fiches. ' +
                    'Aucune modification enregistrée — réessayez dans un instant.',
            };
            if (map[msg]) {
                console.error('fuseBooks error:', error);
                return { ok: false, message: map[msg] };
            }
            return {
                ok: false,
                ...unexpectedErrorResult({
                    where: `fuseBooks(${survivorId} ← ${removedId})`,
                    error,
                    what: committed
                        ? 'La fusion est enregistrée, mais la mise à jour des pages qui suit a échoué.'
                        : 'La fusion a échoué.',
                    outcome: committed
                        ? 'Rechargez la page pour voir la fiche conservée.'
                        : 'Aucune modification enregistrée.',
                }),
            };
        }
    });
}

/**
 * DELETE: hard-delete one book, en laissant son dossier audio dans le bucket.
 *
 * Passe par deleteBookWithAudio, comme la route DELETE du livre. Avant, cet
 * écran supprimait la ligne sèchement et comptait sur Postgres pour refuser :
 *  - le refus arrivait en P2003 sans dire QUELLE demande bloquait, et laissait
 *    passer l'historique supprimé (le filtre soft-delete de lib/prisma.ts le
 *    cachait au contrôle mais pas à la contrainte) ;
 *  - rien ne vérifiait qu'une AUTRE fiche revendiquait le même dossier audio —
 *    or c'est précisément l'écran des doublons, donc le cas nominal ;
 *  - le dossier restait dans le bucket sans que rien ne l'annonce, et les
 *    pistes déjà en corbeille perdaient la trace de leur livre.
 *
 * Pas de choix offert ici : « laisser le dossier » est le seul sort raisonnable
 * pour un doublon, l'enregistrement étant justement celui que le jumeau garde —
 * et c'est aussi le seul que deleteBookWithAudio accepte quand les deux fiches
 * partagent le dossier, le cas le plus courant sur cet écran.
 */
export async function deleteBook(bookId: number): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        if (!Number.isInteger(bookId)) return { ok: false, message: 'Identifiant invalide' };

        try {
            const result = await deleteBookWithAudio({
                bookId,
                performedById: me.id,
                disposition: { mode: 'leave' },
            });
            if (!result.ok) return { ok: false, message: result.error };

            revalidateAdmin();
            revalidateCatalogue();
            // « attend dans Audio orphelins » : faux depuis la suppression douce —
            // le dossier reste attaché à la fiche masquée (voir deleteBookWithAudio).
            const { trackCount, keptBy, orphanedPrefix } = result.audio;
            const pistes = `${trackCount} piste${trackCount > 1 ? 's' : ''}`;
            return {
                ok: true,
                message: keptBy?.length
                    ? `Livre supprimé. Le dossier audio (${pistes}) n’a pas bougé : il reste celui de ` +
                      `${keptBy.map((b) => `« ${b.title} » (#${b.id})`).join(', ')}.`
                    : orphanedPrefix
                      ? `Livre supprimé. Son dossier audio (${pistes}) est resté dans le stockage, ` +
                        `attaché à la fiche supprimée : il revient avec elle si on la restaure.`
                      : 'Livre supprimé avec succès',
            };
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2025') return { ok: false, message: 'Livre introuvable' };
                if (error.code === 'P2003') {
                    return {
                        ok: false,
                        message: 'Ce livre est rattaché à des demandes ou attributions. Fusionnez-le plutôt que de le supprimer.',
                    };
                }
            }
            // deleteBookWithAudio ne pose `deletedAt` qu'en dernière écriture, et
            // en « laisser le dossier » rien ne touche au stockage avant.
            return {
                ok: false,
                ...unexpectedErrorResult({
                    where: `deleteBook(${bookId}) depuis Doublons`,
                    error,
                    what: 'La suppression du livre a échoué.',
                    outcome: 'La fiche n’a pas été supprimée et le dossier audio n’a pas bougé.',
                }),
            };
        }
    });
}

/** Longest note we'll relay. Past this it isn't an escalation note, it's a novel. */
const MAX_ESCALATION_NOTE = 2000;

/**
 * ESCALATE: hand a doublon the permanent cannot settle over to the person who
 * fixes those by hand in the database.
 *
 * Available on **every** pair, not only on the double-recording dead end. The
 * import's suggestion can simply be wrong — a « tome 1 » matched against the
 * « pt 2 » folder of the same title — and there is nothing in the queue that
 * fixes a bad match: fusing would be destructive, « pas un doublon » would drop
 * the flag and hide the problem. So whatever the pair looks like, the permanent
 * can hand it over instead of choosing between two wrong answers.
 *
 * `note` says what is wrong. It is required unless the pair carries the audio
 * conflict, which speaks for itself — a mail saying only "look at this" costs
 * the recipient the whole investigation.
 *
 * Nothing about the books changes and they stay in the queue — the only trace is
 * `escalatedAt`, which exists so the mail isn't re-sent on every visit. The stamp
 * is written only once the mail has actually left, otherwise the escalation would
 * look done while nobody was told.
 */
export async function escalateReview(
    flaggedId: number,
    matchedId: number | null,
    note: string = ''
): Promise<ActionResult> {
    return asAdminAction(async (me) => {
        if (!Number.isInteger(flaggedId)) return { ok: false, message: 'Identifiant invalide' };

        const comment = note.trim().slice(0, MAX_ESCALATION_NOTE);

        const select = {
            id: true,
            title: true,
            author: true,
            audio_filepath: true,
            audioLinkStatus: true,
            audioTrackCount: true,
            source_access_id: true,
        } as const;

        try {
            const [flagged, matched, actor] = await Promise.all([
                prisma.book.findUnique({ where: { id: flaggedId }, select }),
                matchedId != null && Number.isInteger(matchedId)
                    ? prisma.book.findUnique({ where: { id: matchedId }, select })
                    : Promise.resolve(null),
                prisma.user.findUnique({
                    where: { id: me.id },
                    select: { name: true, email: true, firstName: true, lastName: true },
                }),
            ]);
            if (!flagged) return { ok: false, message: 'Livre introuvable' };

            // Recomputed here rather than taken from the client: it decides whether the
            // note may be omitted, and it is what the mail announces as the blocker.
            //
            // Reads the cached columns rather than the bucket, unlike the fusion
            // guard: this only decides whether the permanent must type a sentence,
            // and making them wait on two listings to send a mail would be a worse
            // trade than occasionally asking for a note that turns out unnecessary.
            const audioConflict = !!matched && isDoubleRecording(flagged, matched);

            if (!audioConflict && !comment) {
                return { ok: false, message: 'Expliquez en une phrase ce qui bloque sur ce doublon' };
            }

            const result = await sendReviewEscalation({
                flagged,
                matched,
                audioConflict,
                note: comment || null,
                escalatedBy: getUserDisplayName(actor) || me.email || `#${me.id}`,
            });

            if (!result.sent) {
                return {
                    ok: false,
                    message:
                        result.reason === 'no-recipient'
                            ? "Aucune adresse d'escalade configurée. Prévenez Stéphan directement."
                            : "L'email n'a pas pu être envoyé. Le doublon n'a pas été signalé — prévenez Stéphan directement.",
                };
            }

            await prisma.book.update({ where: { id: flaggedId }, data: { escalatedAt: new Date() } });
            revalidateAdmin();
            return { ok: true, message: 'Doublon signalé à Stéphan pour traitement manuel' };
        } catch (error) {
            // L'e-mail part AVANT l'écriture d'`escalatedAt` : une panne ici a pu
            // survenir après l'envoi.
            return {
                ok: false,
                ...unexpectedErrorResult({
                    where: `escalateReview(${flaggedId}, ${matchedId})`,
                    error,
                    what: 'Le signalement a échoué.',
                    outcome:
                        'L’e-mail a pu partir malgré tout, mais le doublon n’apparaîtra peut-être ' +
                        'pas comme signalé : rechargez la page avant de recommencer.',
                }),
            };
        }
    });
}

/** NOT A DUP: clear the review flag on the flagged book — no merge, no delete. */
export async function dismissReview(bookId: number): Promise<ActionResult> {
    return asAdminAction(async () => {
        if (!Number.isInteger(bookId)) return { ok: false, message: 'Identifiant invalide' };

        try {
            await prisma.book.update({ where: { id: bookId }, data: { needsReview: false } });
            revalidateAdmin();
            return { ok: true, message: 'Livre retiré de la file de révision' };
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                return { ok: false, message: 'Livre introuvable' };
            }
            return {
                ok: false,
                ...unexpectedErrorResult({
                    where: `dismissReview(${bookId})`,
                    error,
                    what: 'Le retrait de la file a échoué.',
                    outcome: 'Rien n’a été modifié.',
                }),
            };
        }
    });
}
