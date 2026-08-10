/**
 * Measuring ONE track, independent of where the bytes come from.
 *
 * IMPLEMENTATION ONLY — no `server-only`, no Prisma, no S3 client. Callers pass
 * a range reader and get a measurement back. The split exists for the same
 * reason bucket-core's does: the route reaches the bucket through the
 * server-only wrapper, while the backfill script runs under plain Node with its
 * own S3 client, and both must measure a track the *same* way. A second
 * implementation for the script is how a backfill and a button end up quietly
 * disagreeing about the length of the same file.
 */

import { probeAudioDuration, summariseMpeg, mayNeedTail } from './duration-probe';

/**
 * Enough for the first frame plus a Xing tag in every file sampled from the
 * corpus. A 64 Kio read returned byte-identical answers for four times the data,
 * so the larger read is kept only as the escalation below.
 */
export const HEAD_BYTES = 16 * 1024;
/** Second attempt, for a file whose ID3v2 block (cover art, mostly) buries the first frame. */
export const HEAD_BYTES_RETRY = 64 * 1024;
/** Tail read, for an MP4 that keeps `moov` at the end. */
export const TAIL_BYTES = 256 * 1024;
/** Slice read from mid-file to confirm a constant bitrate. */
export const PROBE_BYTES = 16 * 1024;

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

export const PROBLEM_LABEL: Record<string, string> = {
    UNSUPPORTED_FORMAT: 'format non pris en charge',
    NEED_MORE_BYTES: 'en-tête introuvable dans le fichier',
    NO_FRAME: 'fichier illisible ou endommagé',
    IMPLAUSIBLE: 'en-tête incohérent',
    VARIABLE_BITRATE: 'débit variable sans repère de durée — mesure impossible',
};

/** Reads `[start, end]` inclusive of one object. */
export type ReadRange = (key: string, start: number, end: number) => Promise<Uint8Array>;

/** Run `worker` over `items` with a bounded number in flight. */
export async function pool<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>,
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
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
    read: ReadRange,
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
    const chunk = await read(key, start, start + PROBE_BYTES - 1);
    const mid = summariseMpeg(chunk);
    // An unreadable slice is not evidence of variability — mid-file bytes can
    // land inside a frame we cannot resynchronise on. Absence of contradiction
    // is what is being tested.
    return !mid || mid.bitrateKbps === bitrateKbps;
}

/**
 * Measure one track from its header bytes.
 *
 * An estimate is the only answer that can be silently wrong, so it is the only
 * one that has to be earned: a file with no Xing/VBRI counter gets one extra
 * read from its middle, and is refused outright if the bitrate there disagrees.
 * Measured across the corpus the estimate is either right to under a second or
 * wrong by over ten minutes, so there is no tolerance to fall back on.
 */
export async function measureTrackBytes(
    read: ReadRange,
    track: { key: string; name: string; sizeBytes: number },
): Promise<TrackMeasure> {
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
        let head = await read(track.key, 0, Math.min(HEAD_BYTES, track.sizeBytes) - 1);
        let result = probeAudioDuration(track.name, head, track.sizeBytes);

        // A big ID3v2 block — cover art, usually — can push the first frame past
        // the small read. Pay for the larger one only on the files that need it.
        if (!result.ok && result.reason === 'NO_FRAME' && track.sizeBytes > HEAD_BYTES) {
            head = await read(track.key, 0, Math.min(HEAD_BYTES_RETRY, track.sizeBytes) - 1);
            result = probeAudioDuration(track.name, head, track.sizeBytes);
        }

        if (!result.ok && result.reason === 'NEED_MORE_BYTES' && mayNeedTail(track.name)) {
            const start = Math.max(0, track.sizeBytes - TAIL_BYTES);
            const tail = await read(track.key, start, track.sizeBytes - 1);
            result = probeAudioDuration(track.name, head, track.sizeBytes, tail);
        }

        if (!result.ok) {
            return { ...base, problem: PROBLEM_LABEL[result.reason] ?? result.reason };
        }

        if (!result.exact && result.method === 'MPEG_CBR') {
            const summary = summariseMpeg(head);
            const constant =
                !summary ||
                (await confirmConstantBitrate(
                    read,
                    track.key,
                    track.sizeBytes,
                    summary.bitrateKbps,
                ));
            if (!constant) return { ...base, problem: PROBLEM_LABEL.VARIABLE_BITRATE };
        }

        return {
            ...base,
            seconds: Math.round(result.seconds),
            method: result.method,
            exact: result.exact,
        };
    } catch (error) {
        console.error(`measureTrackBytes: lecture impossible pour ${track.key}`, error);
        return { ...base, problem: 'stockage injoignable' };
    }
}
