import 'server-only';

import { prisma } from '@/lib/prisma';
import { getRangeBytes, listBookTracks } from './bucket';
import { measureTrackBytes, pool, type TrackMeasure } from './measure-core';
import { resolvePrefix } from './state';

/**
 * Measures a book's recording from the bucket, without transferring it.
 *
 * ## Why this exists
 *
 * Book.readingDurationMinutes could only ever be filled from an UPLOAD event
 * carrying a length the browser read at upload time. Every book whose audio
 * predates that — the whole imported catalogue — showed « Non calculée » for
 * ever, and no refresh could change it, because there was nothing to sum. The
 * workaround in the field was to download a folder and upload it again purely to
 * manufacture those events. This reads the same fact straight out of the files.
 *
 * ## What it costs
 *
 * One ranged GET per track. There is no bulk read in the S3 API, and the obvious
 * way around it — divide the folder's total weight by one track's bitrate — was
 * measured and rejected: it is right to 0.01 % on uniform folders and out by ten
 * minutes on a folder whose last track was encoded at a different rate, which
 * nothing but reading the headers reveals. So the cost is paid once per track
 * and cached in AudioTrackDuration; a second press pays only for tracks whose
 * weight moved.
 *
 * The per-track measurement itself lives in ./measure-core, shared verbatim with
 * scripts/backfill-audio-durations.ts.
 */

export type { TrackMeasure } from './measure-core';

/**
 * Parallel ranged GETs. Measured: a 26-track folder takes 14.7 s serially, 3.7 s
 * at six, 2.9 s at sixteen — latency-bound, so some concurrency is the whole
 * game and more than this buys little.
 */
const CONCURRENCY = 8;

/**
 * Uncached tracks measured — and written to the cache — per batch, before the
 * next batch starts.
 *
 * There used to be a ceiling instead (MAX_TRACKS = 200, « far beyond anything
 * in the corpus ») and a single cache write at the very end. The corpus has 17
 * folders over 200 tracks, up to 364: those were refused outright, and a large
 * folder measured on a slow day lost ALL its work when the function was stopped
 * before that final write — so the next press started again from nothing, and
 * stopped at the same place. Batches written as they go, plus a deadline, make
 * every press move the cache forward; the caller presses again while `pending`
 * is non-zero.
 */
const BATCH = CONCURRENCY * 5;

export interface MeasureResult {
    tracks: TrackMeasure[];
    /** Sum in seconds, or null while any track is unmeasured — see below. */
    totalSeconds: number | null;
    measured: number;
    failed: number;
    fromCache: number;
    /**
     * Tracks this call did not reach because `deadline` passed. Not failures:
     * the next call starts with them (everything before them is now cached).
     */
    pending: number;
}

/**
 * Measure a set of tracks, reusing whatever the cache already knows for them
 * and persisting whatever it doesn't — the one implementation both the
 * Recalculer button and a fresh upload go through.
 *
 * Before this, an upload's duration was only ever the browser's own reading
 * of the file (hooks/useAudioUpload.ts), taken on faith and never checked
 * against the header bytes unless a permanent later pressed Recalculer. That
 * is a known-unreliable number — some browsers report it wrong, occasionally
 * Infinity, for MP3s that carry no duration metadata of their own — and nothing
 * corrected it automatically. The upload dialogue now calls the Recalculer
 * route (measureBookDurations, below) as soon as a batch is committed — no
 * longer from inside the commit route, where a slow measurement could push it
 * past its time limit and lose the refresh that follows — so a fresh upload
 * gets the exact same, byte-accurate answer as a manual recalculation, moments
 * after it lands: resolveTrackDurations (lib/audio/state.ts) already
 * prefers a cached measurement over the browser-reported event whenever the
 * two describe the same size, so populating the cache here is all it takes for
 * that preference to kick in immediately instead of waiting for a button press.
 * The browser reading is still recorded on the UPLOAD event and still used as a
 * fallback — for the formats this parser does not implement (ogg, aac…), it
 * remains the only answer there is.
 */
export async function measureAndCacheTracks(
    bookId: number,
    tracks: { key: string; name: string; sizeBytes: number }[],
    /** Epoch ms after which no new batch starts. See BATCH and `pending`. */
    deadline?: number,
): Promise<{ tracks: TrackMeasure[]; fromCache: number; pending: number }> {
    if (!tracks.length) return { tracks: [], fromCache: 0, pending: 0 };

    const cachedRows = await prisma.audioTrackDuration.findMany({
        where: { bookId, filename: { in: tracks.map((t) => t.name) } },
        select: { filename: true, sizeBytes: true, seconds: true, method: true, exact: true },
    });
    const cache = new Map(cachedRows.map((r) => [r.filename, r]));

    // In folder order, so the answer reads like the folder; null = not reached.
    const results: (TrackMeasure | null)[] = tracks.map((track) => {
        const hit = cache.get(track.name);
        if (!hit || Number(hit.sizeBytes) !== track.sizeBytes) return null;
        return {
            filename: track.name,
            sizeBytes: track.sizeBytes,
            seconds: hit.seconds,
            method: hit.method,
            exact: hit.exact,
            problem: null,
            cached: true,
        } satisfies TrackMeasure;
    });
    const fromCache = results.filter((r) => r !== null).length;
    const todo = tracks.map((_, i) => i).filter((i) => results[i] === null);

    for (let start = 0; start < todo.length; start += BATCH) {
        if (deadline !== undefined && Date.now() >= deadline) break;
        const batch = todo.slice(start, start + BATCH);
        const measured = await pool(batch, CONCURRENCY, (i) =>
            measureTrackBytes(getRangeBytes, {
                key: tracks[i].key,
                name: tracks[i].name,
                sizeBytes: tracks[i].sizeBytes,
            }),
        );
        batch.forEach((i, j) => {
            results[i] = measured[j];
        });

        // Persist what this batch measured, replacing rather than accumulating:
        // this is a cache of the file as it stands, not a history of what it
        // used to be. Two statements in one transaction rather than an upsert
        // per track.
        const fresh = measured.filter((r) => r.seconds !== null);
        if (fresh.length) {
            await prisma.$transaction([
                prisma.audioTrackDuration.deleteMany({
                    where: { bookId, filename: { in: fresh.map((r) => r.filename) } },
                }),
                prisma.audioTrackDuration.createMany({
                    data: fresh.map((r) => ({
                        bookId,
                        filename: r.filename,
                        sizeBytes: BigInt(r.sizeBytes),
                        seconds: r.seconds!,
                        method: r.method ?? 'INCONNU',
                        exact: r.exact,
                    })),
                }),
            ]);
        }
    }

    const done = results.filter((r): r is TrackMeasure => r !== null);
    return { tracks: done, fromCache, pending: tracks.length - done.length };
}

/**
 * A refusal this function is sure about, carrying the status it deserves.
 *
 * Without it every failure looks the same to the route, which then has to report
 * « le stockage a échoué » for a book id that simply does not exist. The
 * distinction matters to whoever reads the message: one is worth retrying and
 * the other never will be.
 */
export class MeasureError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'MeasureError';
    }
}

/**
 * Measure every track of a book, reusing what was measured before.
 *
 * `totalSeconds` is null unless EVERY current track resolved, mirroring the rule
 * refreshBookAudioState already applies: a partial sum understates the recording,
 * and a duration that is quietly too short is worse than no duration at all —
 * this figure is what an auditeur reads when choosing a book.
 *
 * With a `deadline`, a large folder may need several calls: each one measures
 * and caches what fits, and reports the rest as `pending`.
 */
export async function measureBookDurations(
    bookId: number,
    opts: { deadline?: number } = {},
): Promise<MeasureResult> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true },
    });
    if (!book) throw new MeasureError('Livre introuvable', 404);

    const prefix = resolvePrefix(book.audio_filepath);
    const tracks = prefix ? await listBookTracks(prefix) : [];
    if (!tracks.length) {
        return { tracks: [], totalSeconds: null, measured: 0, failed: 0, fromCache: 0, pending: 0 };
    }

    // A cached row is believed only while the object still weighs what it did
    // when measured — see the model comment for why the filename alone is not an
    // identity in this corpus. Already-measured tracks cost a lookup, so the
    // call the upload dialogue makes after every batch only reads the new ones.
    const { tracks: results, fromCache, pending } = await measureAndCacheTracks(bookId, tracks, opts.deadline);

    const measured = results.filter((r) => r.seconds !== null);
    return {
        tracks: results,
        totalSeconds:
            pending === 0 && measured.length === results.length
                ? measured.reduce((s, r) => s + r.seconds!, 0)
                : null,
        measured: measured.length,
        failed: results.length - measured.length,
        fromCache,
        pending,
    };
}
