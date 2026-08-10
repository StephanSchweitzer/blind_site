import 'server-only';

import { prisma } from '@/lib/prisma';
import { getRangeBytes, listBookTracks } from './bucket';
import { probeAudioDuration, summariseMpeg, mayNeedTail } from './duration-probe';
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
 * One ranged GET per track, of HEAD_BYTES. There is no bulk read in the S3 API,
 * and the obvious way around it — divide the folder's total weight by one
 * track's bitrate — was measured and rejected: it is right to 0.01 % on uniform
 * folders and out by ten minutes on a folder whose last track was encoded at a
 * different rate, which nothing but reading the headers reveals. So the cost is
 * paid once per track and cached in AudioTrackDuration; a second press pays only
 * for tracks whose weight moved.
 *
 * ## Why an estimate is confirmed before it is believed
 *
 * A file with no Xing/VBRI tag has no stated length, so its duration is bytes ÷
 * bitrate — exact for a constant-bitrate file and wrong by a third for a
 * variable-bitrate one. The error is not a tolerance question: measured across
 * the corpus it is either under a second or over ten minutes, nothing between.
 * So an untagged file gets ONE extra read from its middle, and the estimate is
 * only recorded if the bitrate there matches the first frame's. A file that
 * fails is reported unmeasurable rather than guessed at — this number is printed
 * in the Coup de cœur PDF and shown in the public catalogue.
 */

/**
 * Enough for the first frame plus a Xing tag in every file sampled from the
 * corpus. A 64 Kio read returned byte-identical answers for four times the data,
 * so the larger read is kept only as the escalation below.
 */
const HEAD_BYTES = 16 * 1024;
/** Second attempt, for a file whose ID3v2 block (cover art, mostly) buries the first frame. */
const HEAD_BYTES_RETRY = 64 * 1024;
/** Tail read, for an MP4 that keeps `moov` at the end. */
const TAIL_BYTES = 256 * 1024;
/** Slice read from mid-file to confirm a constant bitrate. */
const PROBE_BYTES = 16 * 1024;

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
 * tracks and whose largest sampled folder held 61. A book that trips this is
 * therefore much more likely to be a mis-linked folder than a real recording,
 * which is why the message asks for a human rather than suggesting a retry.
 */
const MAX_TRACKS = 200;

export interface TrackMeasure {
    filename: string;
    sizeBytes: number;
    seconds: number | null;
    method: string | null;
    exact: boolean;
    /** Why it could not be measured, in French, for the admin to act on. */
    problem: string | null;
    /** True when the value came from the cache rather than a fresh read. */
    cached: boolean;
}

export interface MeasureResult {
    tracks: TrackMeasure[];
    /** Sum in seconds, or null while any track is unmeasured — see below. */
    totalSeconds: number | null;
    measured: number;
    failed: number;
    fromCache: number;
}

const PROBLEM_LABEL: Record<string, string> = {
    UNSUPPORTED_FORMAT: 'format non pris en charge',
    NEED_MORE_BYTES: 'en-tête introuvable dans le fichier',
    NO_FRAME: 'fichier illisible ou endommagé',
    IMPLAUSIBLE: 'en-tête incohérent',
    VARIABLE_BITRATE: 'débit variable sans repère de durée — mesure impossible',
};

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

/** Run `worker` over `items` with a bounded number in flight. */
async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await worker(items[i]);
            }
        }),
    );
    return out;
}

/**
 * Is this untagged MPEG file really constant-bitrate?
 *
 * One read from the middle. A folder is not uniform — the corpus holds folders
 * mixing 64 and 128 kbps — so this is asked per file, never per folder.
 */
async function confirmConstantBitrate(
    key: string,
    sizeBytes: number,
    bitrateKbps: number,
): Promise<boolean> {
    const start = Math.floor(sizeBytes / 2);
    if (start + PROBE_BYTES >= sizeBytes) {
        // Too short to sample anywhere but the header we already read. A file
        // this small is seconds long, so a wrong reading cannot move the total.
        return true;
    }
    const chunk = await getRangeBytes(key, start, start + PROBE_BYTES - 1);
    const mid = summariseMpeg(chunk);
    // An unreadable slice is not evidence of variability — mid-file bytes can
    // land inside a frame we cannot resynchronise on. Absence of contradiction
    // is what is being tested.
    return !mid || mid.bitrateKbps === bitrateKbps;
}

async function measureTrack(track: {
    key: string;
    name: string;
    sizeBytes: number;
}): Promise<TrackMeasure> {
    const base: TrackMeasure = {
        filename: track.name,
        sizeBytes: track.sizeBytes,
        seconds: null,
        method: null,
        exact: false,
        problem: null,
        cached: false,
    };

    try {
        let head = await getRangeBytes(track.key, 0, Math.min(HEAD_BYTES, track.sizeBytes) - 1);
        let result = probeAudioDuration(track.name, head, track.sizeBytes);

        // A big ID3v2 block — cover art, usually — can push the first frame past
        // the small read. Pay for the larger one only on the files that need it.
        if (!result.ok && result.reason === 'NO_FRAME' && track.sizeBytes > HEAD_BYTES) {
            head = await getRangeBytes(
                track.key,
                0,
                Math.min(HEAD_BYTES_RETRY, track.sizeBytes) - 1,
            );
            result = probeAudioDuration(track.name, head, track.sizeBytes);
        }

        if (!result.ok && result.reason === 'NEED_MORE_BYTES' && mayNeedTail(track.name)) {
            const start = Math.max(0, track.sizeBytes - TAIL_BYTES);
            const tail = await getRangeBytes(track.key, start, track.sizeBytes - 1);
            result = probeAudioDuration(track.name, head, track.sizeBytes, tail);
        }

        if (!result.ok) {
            return { ...base, problem: PROBLEM_LABEL[result.reason] ?? result.reason };
        }

        // An estimate is the only answer that can be silently wrong, so it is the
        // only one that has to be earned.
        if (!result.exact && result.method === 'MPEG_CBR') {
            const summary = summariseMpeg(head);
            const constant =
                !summary ||
                (await confirmConstantBitrate(track.key, track.sizeBytes, summary.bitrateKbps));
            if (!constant) {
                return { ...base, problem: PROBLEM_LABEL.VARIABLE_BITRATE };
            }
        }

        return {
            ...base,
            seconds: Math.round(result.seconds),
            method: result.method,
            exact: result.exact,
        };
    } catch (error) {
        console.error(`measureTrack: lecture impossible pour ${track.key}`, error);
        return { ...base, problem: 'stockage injoignable' };
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

    const results = await pool(tracks, async (track) => {
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
        return measureTrack(track);
    });

    // Persist only what was freshly measured, replacing rather than accumulating:
    // this is a cache of the file as it stands, not a history of what it used to
    // be. Done as two statements in one transaction rather than an upsert per
    // track — a folder of forty tracks is forty round trips otherwise, on top of
    // the forty range reads it already cost.
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
