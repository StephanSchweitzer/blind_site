import 'server-only';

import { prisma } from '@/lib/prisma';
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

    await prisma.book.update({
        where: { id: bookId },
        data: {
            audioLinkStatus: status,
            audioTrackCount: trackCount,
            audioSizeKb: sizeKb,
            audioCheckedAt: new Date(),
        },
    });

    // Only on a real move. Re-reads are frequent and mostly confirm what was
    // already stored; repricing on every one would add an AMOUNT_CHANGED row to
    // the bill history that records nothing having happened.
    const repriced =
        sizeKb !== null && sizeKb !== book.audioSizeKb
            ? (await repriceOpenOrdersForBook(bookId, performedById)).repriced
            : 0;

    return { status, trackCount, sizeKb, prefix, repriced };
}
