import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    HeadObjectCommand,
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { isAppleDoubleName } from './naming';

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

/**
 * Is this object a real recording, rather than something that merely ends in
 * `.mp3`?
 *
 * ## AppleDouble
 *
 * Copying files from a Mac onto a non-Mac filesystem writes a companion
 * `._name.ext` beside every `name.ext`, holding resource-fork metadata. They are
 * a few hundred bytes, contain no audio, and — because the corpus was migrated
 * through a Mac — there are ~1 856 of them sitting in the catalogue next to the
 * real tracks.
 *
 * Matching on the extension alone counts every one of them as a track. That
 * DOUBLED the reported track count of every affected book, and made the reading
 * duration impossible to compute for all of them: the total is refused unless
 * every track resolves, and a 300-byte metadata stub never will.
 *
 * The rule itself lives in ./naming, with the upload side that refuses to let
 * new ones in — one definition, both directions.
 */
export function isAudioKey(key: string): boolean {
    return AUDIO_EXT.test(key) && !isAppleDoubleName(key);
}

/** B2's console shows a bare host; the SDK needs a URL. */
function normaliseEndpoint(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export const AUDIO_BUCKET = process.env.S3_AUDIO_BUCKET ?? '';

let client: S3Client | null = null;

/**
 * A socket that opens and then hangs used to consume the entire function
 * budget — nothing here bounded it. `requestTimeout` is Node's socket
 * *inactivity* timeout (`socket.setTimeout`), not a hard deadline on the whole
 * call: every byte received resets it, so a slow-but-flowing range read
 * (`getRangeBytes`, used by the duration probe) or a large ListObjectsV2 page
 * is not at risk — only a connection that has genuinely gone silent trips it.
 * `connectionTimeout` bounds the separate wait for the TCP handshake itself.
 */
function getRequestHandler(): NodeHttpHandler {
    return new NodeHttpHandler({
        connectionTimeout: 3_000,
        requestTimeout: 10_000,
    });
}

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
        requestHandler: getRequestHandler(),
        // Explicit rather than relying on the SDK default: B2 sheds load with
        // 5xx by design (see hooks/useAudioUpload.ts), so a couple of retries
        // at this layer too is deliberate, not incidental.
        maxAttempts: 3,
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
 * Filter a raw listing down to audio, in playback order. Split out of
 * `listBookTracks` so a caller that already holds a raw listing (e.g. from
 * `listRawObjects`, for the FOLDER_EMPTY/FOLDER_MISSING distinction) can
 * derive the same ordered track view without a second LIST call.
 *
 * Excludes anything in a sub-folder of `prefix` (an extra `/` past it) —
 * confirmed against the whole corpus to not currently occur, but
 * `isKeyInsidePrefix` (lib/audio/state.ts) already refuses to touch such an
 * object on any write path, so counting, weighing, pricing or playing one
 * here would have been a book the portal could show and price but never
 * let an admin delete or rename. This is the one place that rule must agree
 * with; if either changes, so must the other.
 */
export function toOrderedTracks(objects: { key: string; size: number }[], prefix: string): AudioTrack[] {
    return objects
        .filter((o) => isAudioKey(o.key) && !o.key.slice(prefix.length).includes('/'))
        .sort((a, b) => naturalCompare(a.key.split('/').pop()!, b.key.split('/').pop()!))
        .map((o, i) => ({
            order: i + 1,
            key: o.key,
            name: o.key.split('/').pop()!,
            sizeBytes: o.size,
        }));
}

/**
 * Every audio file under a book's folder, in playback order.
 *
 * `prefix` is Book.audio_filepath, which since the backfill holds the bucket key
 * verbatim (`dirt/2022/21525  Titre/`) — no translation needed.
 */
export async function listBookTracks(prefix: string): Promise<AudioTrack[]> {
    if (!prefix) return [];
    return toOrderedTracks(await listRawObjects(prefix), prefix);
}

/**
 * Every object under a prefix, audio or not.
 *
 * `listBookTracks` filters to audio, which cannot distinguish "the folder is
 * there but holds only B2's .bzEmpty placeholder" (FOLDER_EMPTY) from "there is
 * nothing at this prefix at all" (FOLDER_MISSING). Callers that must tell those
 * apart — the status refresh — need the unfiltered listing.
 */
export async function listRawObjects(prefix: string): Promise<{ key: string; size: number }[]> {
    if (!prefix) return [];
    const s3 = getS3();
    const out: { key: string; size: number }[] = [];
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
            if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
}

/**
 * Time-limited download URL for one track. Default one hour.
 *
 * `downloadAs` sets Content-Disposition on the response: a cross-origin
 * `<a download>` is ignored by browsers, so without it a "download" click opens
 * the file in a tab under a meaningless key-derived name.
 */
export function getTrackUrl(key: string, expiresIn = 3600, downloadAs?: string): Promise<string> {
    return getSignedUrl(
        getS3(),
        new GetObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: key,
            ...(downloadAs
                ? {
                      // RFC 5987: the corpus is full of accents, which are not
                      // legal raw in a header value.
                      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(downloadAs)}`,
                  }
                : {}),
        }),
        { expiresIn },
    );
}

/**
 * Time-limited URL the BROWSER uploads to with a direct PUT.
 *
 * The bytes never touch our server — a 50 MB track through a Vercel function
 * would be slow, metered, and pointless. The server's only role is minting this
 * URL, which is what keeps the B2 credentials server-side.
 *
 * Requires a B2 CORS rule allowing `s3_put` from the site origin; without one
 * the browser's preflight fails and no upload can succeed.
 */
export function putTrackUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
        getS3(),
        new PutObjectCommand({ Bucket: AUDIO_BUCKET, Key: key, ContentType: contentType }),
        { expiresIn },
    );
}

/**
 * A byte range of one object, read into memory.
 *
 * The only path that pulls object bytes through our own server, and deliberately
 * so: it exists to read headers — a few kilobytes out of a file that may be 50 MB
 * — which is what lets a recording be measured without transferring it. Callers
 * must keep the range small; nothing here enforces it, because the sole caller
 * (lib/audio/measure.ts) states its own bounds and has to be free to widen them
 * for a file whose header sits further in.
 */
export async function getRangeBytes(
    key: string,
    start: number,
    end: number,
): Promise<Uint8Array> {
    const res = await getS3().send(
        new GetObjectCommand({ Bucket: AUDIO_BUCKET, Key: key, Range: `bytes=${start}-${end}` }),
    );
    return res.Body!.transformToByteArray();
}

export interface TrackHead {
    sizeBytes: number;
    contentType: string | null;
    lastModified: Date | null;
}

/** Metadata for one object, or null when it doesn't exist. */
export async function headTrack(key: string): Promise<TrackHead | null> {
    try {
        const r = await getS3().send(
            new HeadObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }),
        );
        return {
            sizeBytes: r.ContentLength ?? 0,
            contentType: r.ContentType ?? null,
            lastModified: r.LastModified ?? null,
        };
    } catch (e) {
        const name = (e as { name?: string }).name;
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return null;
        throw e;
    }
}

/**
 * CopySource must be `bucket/key`, percent-encoded but with the path separators
 * left intact. The corpus makes this load-bearing rather than pedantic: keys
 * contain spaces, accents, `!`, `#` and `&`, all of which break an unencoded
 * value — `#` in particular truncates the key at the fragment.
 */
function copySource(key: string): string {
    return `${AUDIO_BUCKET}/${key}`.split('/').map(encodeURIComponent).join('/');
}

/** Server-side copy — B2 moves the bytes internally, nothing transits our server. */
export async function copyTrack(fromKey: string, toKey: string): Promise<void> {
    await getS3().send(
        new CopyObjectCommand({
            Bucket: AUDIO_BUCKET,
            CopySource: copySource(fromKey),
            Key: toKey,
        }),
    );
}

/**
 * Remove one object.
 *
 * Deliberately server-side: a presigned DELETE would put the power to erase a
 * recording into a URL, and the payload is a few bytes, so there is no bandwidth
 * argument for handing it out. Callers are expected to have copied the object to
 * the corbeille first — this function itself does not make that check.
 */
export async function deleteTrack(key: string): Promise<void> {
    await getS3().send(new DeleteObjectCommand({ Bucket: AUDIO_BUCKET, Key: key }));
}

/** DeleteObjects accepts at most this many keys per call. */
const DELETE_BATCH = 1000;

/**
 * Remove many objects in as few requests as possible.
 *
 * One DeleteObjects call carries up to a thousand keys, which is the difference
 * between emptying a 77-track folder in one round trip and in seventy-seven.
 * Verified against this bucket before being relied on — B2 implements a subset
 * of the S3 API and batch delete is not part of the subset everywhere.
 *
 * Returns the keys the service reported it could NOT delete, so a caller can
 * tell "all gone" from "mostly gone" instead of assuming. A partial failure is
 * not an exception here: the operation genuinely half-succeeded, and the caller
 * is the only one that knows whether that is recoverable.
 */
export async function deleteTracks(keys: string[]): Promise<{ failed: string[] }> {
    if (!keys.length) return { failed: [] };
    const s3 = getS3();
    const failed: string[] = [];

    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const chunk = keys.slice(i, i + DELETE_BATCH);
        const res = await s3.send(
            new DeleteObjectsCommand({
                Bucket: AUDIO_BUCKET,
                // Quiet: false so the response names what was actually removed;
                // a silent success is indistinguishable from a silent no-op.
                Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: false },
            }),
        );
        const deleted = new Set((res.Deleted ?? []).map((d) => d.Key));
        for (const key of chunk) if (!deleted.has(key)) failed.push(key);
    }

    return { failed };
}

/**
 * Keep an emptied folder in existence, the way B2 itself does.
 *
 * Object storage has no real directories: a prefix exists only while something
 * lives under it. B2's own tooling papers over this by writing a zero-byte
 * `.bzEmpty`, which is why the corpus is littered with them — and why
 * listBookTracks filters them out.
 *
 * Without this, deleting a book's last track makes its folder evaporate, and
 * the status lands on FOLDER_MISSING ("nothing at this path") when the truthful
 * answer is FOLDER_EMPTY ("the folder is there, an admin emptied it"). Those
 * mean very different things to whoever picks the book up next.
 *
 * `remaining`, when given, is trusted instead of listing the prefix again —
 * for a caller (softDeleteTracks) that already knows exactly what it left
 * behind, from the listing it started the mutation with.
 */
export async function ensureFolderPlaceholder(
    prefix: string,
    remaining?: { key: string; size: number }[],
): Promise<boolean> {
    if (!prefix) return false;
    const objects = remaining ?? (await listRawObjects(prefix));
    if (objects.length) return false;
    await getS3().send(
        new PutObjectCommand({
            Bucket: AUDIO_BUCKET,
            Key: `${prefix}.bzEmpty`,
            Body: new Uint8Array(0),
        }),
    );
    return true;
}
