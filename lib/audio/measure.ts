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
 * Folders larger than this are refused rather than risk the function timing out
 * mid-measure.
 *
 * Measured cost is roughly 0.15 s per uncached track at the concurrency above,
 * so this is about thirty seconds of work — comfortably inside a serverless
 * function, and far beyond anything in the corpus, whose folders average 28
 * tracks and whose largest sampled folder held 77. A book that trips this is
 * therefore much more likely to be a mis-linked folder than a real recording,
 * which is why the message asks for a human rather than suggesting a retry.
 */
const MAX_TRACKS = 200;

export interface MeasureResult {
    tracks: TrackMeasure[];
    /** Sum in seconds, or null while any track is unmeasured — see below. */
    totalSeconds: number | null;
    measured: number;
    failed: number;
    fromCache: number;
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
 */
export async function measureBookDurations(bookId: number): Promise<MeasureResult> {
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true },
    });
    if (!book) throw new MeasureError('Livre introuvable', 404);

    const prefix = resolvePrefix(book.audio_filepath);
    const tracks = prefix ? await listBookTracks(prefix) : [];
    if (!tracks.length) {
        return { tracks: [], totalSeconds: null, measured: 0, failed: 0, fromCache: 0 };
    }
    if (tracks.length > MAX_TRACKS) {
        throw new MeasureError(
            `Ce dossier contient ${tracks.length} pistes : mesure automatique impossible ` +
                `au-delà de ${MAX_TRACKS}. Signalez-le à l’informaticien.`,
            413,
        );
    }

    // A cached row is believed only while the object still weighs what it did
    // when measured — see the model comment for why the filename alone is not an
    // identity in this corpus.
    const cachedRows = await prisma.audioTrackDuration.findMany({
        where: { bookId, filename: { in: tracks.map((t) => t.name) } },
        select: { filename: true, sizeBytes: true, seconds: true, method: true, exact: true },
    });
    const cache = new Map(cachedRows.map((r) => [r.filename, r]));

    const results = await pool(tracks, CONCURRENCY, async (track) => {
        const hit = cache.get(track.name);
        if (hit && Number(hit.sizeBytes) === track.sizeBytes) {
            return {
                filename: track.name,
                sizeBytes: track.sizeBytes,
                seconds: hit.seconds,
                method: hit.method,
                exact: hit.exact,
                problem: null,
                cached: true,
            } satisfies TrackMeasure;
        }
        return measureTrackBytes(getRangeBytes, {
            key: track.key,
            name: track.name,
            sizeBytes: track.sizeBytes,
        });
    });

    // Persist only what was freshly measured, replacing rather than accumulating:
    // this is a cache of the file as it stands, not a history of what it used to
    // be. Two statements in one transaction rather than an upsert per track — a
    // folder of forty tracks is forty round trips otherwise, on top of the forty
    // range reads it already cost.
    const fresh = results.filter((r) => !r.cached && r.seconds !== null);
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

    const measured = results.filter((r) => r.seconds !== null);
    return {
        tracks: results,
        totalSeconds:
            measured.length === results.length
                ? measured.reduce((s, r) => s + r.seconds!, 0)
                : null,
        measured: measured.length,
        failed: results.length - measured.length,
        fromCache: results.filter((r) => r.cached).length,
    };
}
