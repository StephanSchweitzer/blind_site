import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Audio storage access (Backblaze B2 via its S3-compatible API).
 *
 * IMPLEMENTATION ONLY — application code must import `./bucket`, which adds the
 * `server-only` guard. This file omits it purely so the same code can be
 * exercised by scripts under plain Node (`server-only` throws outside a
 * bundler), and it is the reason the split exists at all.
 *
 * Either way the B2 keys stay server-side: clients receive time-limited
 * presigned URLs from /api/books/[id]/audio, which keeps the bucket private and
 * keeps 10 MB tracks off our own bandwidth.
 */

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

/** B2's console shows a bare host; the SDK needs a URL. */
function normaliseEndpoint(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export const AUDIO_BUCKET = process.env.S3_AUDIO_BUCKET ?? '';

let client: S3Client | null = null;

export function getS3(): S3Client {
    if (client) return client;
    client = new S3Client({
        region: process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
        endpoint: normaliseEndpoint(process.env.S3_ENDPOINT),
        // Flexible checksums are an AWS extension that non-AWS S3
        // implementations reject on write. Harmless on reads, required for
        // uploads to work against B2 with the same client.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: {
            accessKeyId: (process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)!,
            secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY ??
                process.env.AWS_SECRET_ACCESS_KEY)!,
        },
    });
    return client;
}

/**
 * Natural ("human") comparison: digit runs compare numerically. Track order is
 * NOT derivable from a track number — folders variously use `1000 12- Titre`,
 * `1000  01 Titre` and date stamps like `1000 141201_1224.MP3` — but natural
 * ordering of the whole filename is correct for all of them.
 *
 * Whitespace runs collapse first: the same folder mixes `1000    01` and
 * `1000   03`, and otherwise the number of spaces would decide the order.
 */
export function naturalCompare(a: string, b: string): number {
    const split = (s: string) => s.replace(/\s+/g, ' ').match(/\d+|\D+/g) ?? [];
    const A = split(a);
    const B = split(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const x = A[i];
        const y = B[i];
        if (/^\d/.test(x) && /^\d/.test(y)) {
            const d = Number(x) - Number(y);
            if (d) return d;
        } else {
            const d = x.localeCompare(y, 'fr');
            if (d) return d;
        }
    }
    return A.length - B.length;
}

export interface AudioTrack {
    /** 1-based playback position. */
    order: number;
    key: string;
    name: string;
    sizeBytes: number;
}

/**
 * Every audio file under a book's folder, in playback order.
 *
 * `prefix` is Book.audio_filepath, which since the backfill holds the bucket key
 * verbatim (`dirt/2022/21525  Titre/`) — no translation needed.
 */
export async function listBookTracks(prefix: string): Promise<AudioTrack[]> {
    if (!prefix) return [];
    const s3 = getS3();
    const keys: { key: string; size: number }[] = [];
    let token: string | undefined;

    do {
        const res = await s3.send(
            new ListObjectsV2Command({
                Bucket: AUDIO_BUCKET,
                Prefix: prefix,
                ContinuationToken: token,
            }),
        );
        for (const o of res.Contents ?? []) {
            // Skip B2's `.bzEmpty` placeholders and any stray non-audio files.
            if (o.Key && AUDIO_EXT.test(o.Key)) keys.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    return keys
        .sort((a, b) => naturalCompare(a.key.split('/').pop()!, b.key.split('/').pop()!))
        .map((k, i) => ({
            order: i + 1,
            key: k.key,
            name: k.key.split('/').pop()!,
            sizeBytes: k.size,
        }));
}

/** Time-limited download URL for one track. Default one hour. */
export function getTrackUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }), {
        expiresIn,
    });
}
