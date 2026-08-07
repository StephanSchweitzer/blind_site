import 'server-only';

import { prisma } from '@/lib/prisma';
import { withoutAudit } from '@/lib/audit/context';
import { bytesToKb } from '@/lib/pricing';
import { repriceOpenOrdersForBook } from '@/lib/pricing-sync';
import { listRawObjects } from './bucket';

/**
 * Keeps Book.audioLinkStatus / audioTrackCount / audioSizeKb / audioCheckedAt
 * honest after the portal changes what is in a folder.
 *
 * These columns are a cache of the bucket, normally refreshed in bulk by
 * scripts/sync-audio-links.ts. Once an admin can upload and delete from the UI
 * they go stale the moment they act, so every mutating route calls through here.
 * The status rules deliberately mirror the sync script's, so a UI action and the
 * next nightly run agree rather than flip-flopping.
 */

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

export type AudioLinkStatusValue =
    | 'OK'
    | 'FOLDER_EMPTY'
    | 'FOLDER_MISSING'
    | 'NO_PATH'
    | 'UNVERIFIED';

/**
 * The prefix to list for a book, with a guaranteed trailing slash.
 *
 * Without one, ListObjectsV2 on `dirt/2022/21525  Titre` also matches
 * `dirt/2022/21525  Titre bis/…`. That would inflate the track count, and —
 * far worse — let the containment check in the write routes accept a key that
 * belongs to a neighbouring book.
 */
export function resolvePrefix(audioFilepath: string | null | undefined): string {
    const v = audioFilepath?.trim();
    if (!v) return '';
    return v.endsWith('/') ? v : `${v}/`;
}

/**
 * Guard for every key the client supplies to a write route.
 *
 * The browser sends back keys it got from the listing, but nothing stops a
 * crafted request naming another book's track — or an object outside the audio
 * tree entirely. Deleting is irreversible enough that this is checked at every
 * entry point rather than trusted once.
 */
export function isKeyInsidePrefix(key: string, prefix: string): boolean {
    if (!prefix || !key) return false;
    if (key.includes('..')) return false;
    if (!key.startsWith(prefix)) return false;
    // Must be a file directly in the folder, not in a nested subfolder.
    const rest = key.slice(prefix.length);
    return rest.length > 0 && !rest.includes('/');
}

export interface RefreshResult {
    status: AudioLinkStatusValue;
    trackCount: number | null;
    /** Weight of those tracks in Kio — null whenever trackCount is. */
    sizeKb: number | null;
    prefix: string;
    /** Demandes whose tarif this refresh realigned on the new weight. */
    repriced: number;
}

/**
 * Re-read the folder and persist what we found. Idempotent, safe to call twice.
 *
 * Deleting the last track leaves the folder present but audio-free, so the
 * status becomes FOLDER_EMPTY — never OK with a count of zero.
 *
 * A changed weight also re-tarifies the book's still-adjustable demandes. That
 * coupling is deliberate: the tarif is derived from the weight, and this is the
 * one function every path that can change the weight already goes through — an
 * upload, a deleted or restored track, an orphan folder relinked, a fusion. Put
 * the call in the routes instead and the next audio route to be written forgets
 * it, which is the exact failure the tarif was introduced to stop. See
 * repriceOpenOrdersForBook for what it will and won't touch.
 *
 * `performedById` names who caused the re-read, for the BillEvent it may write.
 */
export async function refreshBookAudioState(
    bookId: number,
    performedById: number | null = null,
): Promise<RefreshResult> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true, audioSizeKb: true },
    });
    if (!book) throw new Error(`Livre ${bookId} introuvable`);

    const prefix = resolvePrefix(book.audio_filepath);

    let status: AudioLinkStatusValue;
    let trackCount: number | null = null;
    let sizeKb: number | null = null;

    if (!prefix) {
        status = 'NO_PATH';
    } else {
        const objects = await listRawObjects(prefix);
        const audio = objects.filter((o) => AUDIO_EXT.test(o.key));
        if (audio.length) {
            status = 'OK';
            trackCount = audio.length;
            // Tied to trackCount on purpose: the weight describes the tracks we
            // just counted, so "no count" and "no weight" always travel together
            // rather than leaving a stale size behind a broken link.
            sizeKb = bytesToKb(audio.reduce((total, o) => total + o.size, 0));
        } else if (objects.length) {
            // The folder exists — B2's .bzEmpty placeholder or some stray file —
            // but holds no audio.
            status = 'FOLDER_EMPTY';
        } else {
            status = 'FOLDER_MISSING';
        }
    }

    // Outside the audit trail, and provably lossless: this statement writes only
    // the four cache columns, and the trail already refuses all four — the three
    // states are DERIVED_FIELDS, audioCheckedAt is a NOISE_FIELD — so it could
    // never produce a surviving event. Saying so here also spares the audit
    // extension its "before" read on a path that runs on every dialogue open.
    //
    // Scoped to this one statement on purpose: the reprice below moves
    // Orders.cost, which IS a decision worth tracing, and must stay audited.
    await withoutAudit(() =>
        prisma.book.update({
            where: { id: bookId },
            data: {
                audioLinkStatus: status,
                audioTrackCount: trackCount,
                audioSizeKb: sizeKb,
                audioCheckedAt: new Date(),
            },
        })
    );

    // Only on a real move. Re-reads are frequent and mostly confirm what was
    // already stored; repricing on every one would add an AMOUNT_CHANGED row to
    // the bill history that records nothing having happened.
    const repriced =
        sizeKb !== null && sizeKb !== book.audioSizeKb
            ? (await repriceOpenOrdersForBook(bookId, performedById)).repriced
            : 0;

    return { status, trackCount, sizeKb, prefix, repriced };
}

/**
 * Does this book hold a recording whose poids is KNOWN? The question
 * guardAssignmentHasAudio needs answered before an attribution may be « Terminé ».
 *
 * POURQUOI LE POIDS, ET PAS audioLinkStatus
 *
 * Because the guard exists to protect a tarif, and the tarif is computed from
 * audioSizeKb alone (lib/pricing.ts) — repriceOpenOrdersForBook refuses to move a
 * price while it is null. « Il y a des fichiers » is not the same claim as « on
 * sait ce qu'ils pèsent », and only the second one makes a facture correct.
 *
 * The distinction is not theoretical: scripts/sync-audio-links.ts sets the status
 * in raw SQL without ever weighing the folder, and it has stamped OK on 11 528 of
 * the 11 529 books that carry it. A guard reading the status would therefore pass
 * essentially the whole catalogue while the price was still unknown — exactly the
 * failure it is meant to prevent.
 *
 * QUAND LE BUCKET EST RELU
 *
 * These columns are a CACHE, so a known weight is believed as-is (one indexed
 * read). Anything else — never verified, verified without weighing, folder
 * reported empty — is re-read from the bucket before we refuse, because refusing
 * on a stale cache would block a legitimate attribution over a bookkeeping lag
 * rather than a missing file. Only the answer we were about to refuse pays for the
 * round trip, and that refresh repairs the cache and re-tarifies the book's
 * demandes on the way through. So a refusal here is always about what the bucket
 * actually holds, never about when it was last read.
 *
 * Returns `null` for "je n'ai pas pu vérifier" — the bucket read failed. Callers
 * must NOT read that as "pas d'audio": this gates a billing decision, so a storage
 * outage has to say so rather than be reported to the permanent as an empty folder
 * they will go looking for in vain. It stays a refusal (guardAssignmentHasAudio
 * fails closed), just an honest one. Swallowed only on this path; every other
 * caller of refreshBookAudioState still sees the error.
 *
 * Call outside a transaction: it reaches S3 and writes through the global client.
 */
export async function bookHasWeighedAudio(
    bookId: number,
    performedById: number | null = null,
): Promise<boolean | null> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audioSizeKb: true },
    });
    if (!book) return false;
    // 0 is a real weight (a folder of empty files), and prices at the plancher
    // like any sub-700-Mio recording. Only null means "not weighed".
    if (book.audioSizeKb != null) return true;

    try {
        const state = await refreshBookAudioState(bookId, performedById);
        return state.sizeKb != null;
    } catch (error) {
        console.error(`bookHasWeighedAudio: bucket unreachable for book ${bookId}`, error);
        return null;
    }
}
