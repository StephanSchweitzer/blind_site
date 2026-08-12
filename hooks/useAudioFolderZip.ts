'use client';

import { useCallback, useRef, useState } from 'react';
import { downloadZip } from 'client-zip';

/**
 * Zip a book's whole audio folder in the browser.
 *
 * Same principle as the upload path: the bytes go browser ↔ B2 and never touch
 * a Vercel function. Each track is fetched from its presigned GET URL and fed
 * into a zip stream — a 40-track folder is several gigabytes, which is precisely
 * the transfer we refuse to pay for twice.
 *
 * ## Why the tracks are fetched ahead of the writer
 *
 * client-zip drains an entry completely before pulling the next one, so handing
 * it the fetches one at a time means exactly one connection to the bucket is
 * ever open, and the next request is not even issued until the previous file's
 * last byte has arrived. The bucket is in Amsterdam and most admins are not: at
 * a ~150 ms round trip a single stream tops out around 1 MB/s however fat the
 * line is, which turns a 200-track book into an hour. Backblaze's own advice for
 * throughput is to keep several requests in flight, and the upload path already
 * does (`CONCURRENCY` in useAudioUpload).
 *
 * So the generator keeps a bounded look-ahead queue: at most LOOKAHEAD_FILES
 * fetches running and at most LOOKAHEAD_BYTES of already-downloaded data
 * waiting, whichever binds first. **Order is unchanged** — the queue is drained
 * head-first, so entries land in the archive in exactly the order they were
 * passed in; only the fetching runs ahead.
 *
 * Each look-ahead fetch resolves to a **Blob**, not to the live Response, so a
 * track that finished early releases its connection instead of holding it open
 * until its turn. What bounds the cost of that window is LOOKAHEAD_BYTES and
 * nothing else: Chrome does page large blobs out to disk under memory pressure,
 * but that is an implementation detail, not a promise — Firefox is happy to keep
 * them in memory. Budget for the window being resident in RAM, and treat
 * disk-backing as a bonus where the browser happens to offer it.
 *
 * Retries follow the same rule as the upload path — B2 answers a share of
 * requests with 5xx by design, and reading a whole folder now means several
 * concurrent requests, so a transient vault error is absorbed rather than
 * failing the archive.
 *
 * Where the archive lands depends on what the browser offers:
 *
 *  - `showSaveFilePicker` (Chrome/Edge): the zip streams to the chosen file as
 *    it is built, so memory stays flat whatever the folder weighs.
 *  - anywhere else (Firefox/Safari): it is buffered into a Blob first. That is
 *    the only option there, and the reason `bufferedFallback` is reported —
 *    the dialogue warns before starting on a big folder.
 *
 * client-zip stores, never deflates. Correct here: MP3s do not compress, and
 * stored entries let the output stream out as the input arrives.
 */

export interface ZipEntry {
    /** Path inside the archive — the track's key relative to the book folder. */
    path: string;
    /** Presigned URL pointing straight at the bucket. */
    url: string;
    sizeBytes: number;
}

export type ZipPhase = 'idle' | 'running' | 'done' | 'error';

/** Minimal structural types: `showSaveFilePicker` is not in TypeScript's DOM lib. */
interface SaveHandle {
    createWritable: () => Promise<WritableStream<Uint8Array>>;
}
type SavePicker = (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

function getSavePicker(): SavePicker | null {
    if (typeof window === 'undefined') return null;
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    return typeof picker === 'function' ? picker : null;
}

/** Windows forbids these outright, and they break the archive elsewhere too. */
export function safeZipName(raw: string): string {
    const cleaned = raw
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
    return `${cleaned || 'audio'}.zip`;
}

/** State updates are throttled: chunks arrive far faster than a UI needs. */
const PROGRESS_INTERVAL_MS = 150;

/**
 * How many tracks may be downloading ahead of the zip writer.
 *
 * Six rather than the upload path's three because these are GETs of whole
 * objects: the ceiling that matters is the pipe, not the bucket's patience. Both
 * this and the byte budget below are deliberately easy to move — they are the
 * two knobs for trading memory against throughput.
 */
const LOOKAHEAD_FILES = 6;

/**
 * How many bytes of finished-but-unwritten track may be held at once.
 *
 * The file count alone is not a bound: six 500 MB tracks are not the same
 * promise as six 20 MB ones. Whichever limit binds first stops the look-ahead.
 * A single track larger than this budget still starts on its own — otherwise the
 * archive would deadlock on it.
 */
const LOOKAHEAD_BYTES = 192 * 1024 * 1024;

/** Attempts per track, including the first. See the retry note in the header. */
const GET_ATTEMPTS = 3;

const RETRY_BASE_MS = 700;
const MAX_BACKOFF_MS = 15_000;

/**
 * Equal-jitter backoff, same shape as useAudioUpload and measure-core.
 *
 * The jitter matters more here than it looks: the look-ahead workers hit the
 * bucket together, so a shared hiccup would otherwise have them all retry in
 * lockstep and collide again. `Retry-After` is not consulted — it is a
 * cross-origin response header the bucket's CORS rule does not expose, so it is
 * simply not readable from here.
 */
function backoffMs(attempt: number): number {
    const base = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    return base / 2 + Math.random() * (base / 2);
}

const abortError = () => new DOMException('Aborted', 'AbortError');

/** Abortable sleep: a cancel during a backoff must not sit for fifteen seconds. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

export function useAudioFolderZip() {
    const [phase, setPhase] = useState<ZipPhase>('idle');
    const [written, setWritten] = useState(0);
    const [fetched, setFetched] = useState(0);
    const [total, setTotal] = useState(0);
    const [currentName, setCurrentName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    const cancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const reset = useCallback(() => {
        setPhase('idle');
        setWritten(0);
        setFetched(0);
        setTotal(0);
        setCurrentName(null);
        setError(null);
    }, []);

    /**
     * `refresh` re-signs the folder's URLs. Needed because the presigned links
     * live an hour and a multi-gigabyte archive can take longer than that: the
     * tracks at the end of a big folder would otherwise be fetched with a URL
     * that expired while the earlier ones were downloading.
     */
    const start = useCallback(async (
        entries: ZipEntry[],
        zipName: string,
        refresh?: () => Promise<ZipEntry[]>,
    ) => {
        if (!entries.length) return;

        // Must run before the first await: the picker needs the click's user
        // activation, and losing it makes the call throw SecurityError.
        const picker = getSavePicker();
        let handle: SaveHandle | null = null;
        if (picker) {
            try {
                handle = await picker({
                    suggestedName: zipName,
                    types: [{ description: 'Archive ZIP', accept: { 'application/zip': ['.zip'] } }],
                });
            } catch {
                // The user dismissed the save dialogue — not an error.
                return;
            }
        }

        const controller = new AbortController();
        abortRef.current = controller;
        const { signal } = controller;

        const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
        setPhase('running');
        setWritten(0);
        setFetched(0);
        setTotal(totalBytes);
        setCurrentName(entries[0]?.path ?? null);
        setError(null);

        let count = 0;
        let lastReport = 0;

        // Bytes off the network, as opposed to `count`, which is bytes into the
        // zip. The two used to be the same number; with a look-ahead they are
        // not, and it is this one that tells the admin the transfer is moving —
        // the writer lags it by up to a whole look-ahead window.
        let pulled = 0;
        let lastPullReport = 0;
        const reportPulled = () => {
            const now = Date.now();
            if (now - lastPullReport >= PROGRESS_INTERVAL_MS) {
                lastPullReport = now;
                setFetched(pulled);
            }
        };

        /**
         * One re-signing for the whole folder, shared by every look-ahead fetch.
         *
         * Several concurrent fetches can meet the same expired hour at the same
         * moment. Memoising the *promise* — not its resolved value — is what
         * collapses that into a single `refresh()`; a lazily filled map would
         * let all six through before the first one answered. Cleared again if it
         * fails, so a later track may still try rather than inheriting a dead
         * result.
         */
        let resigning: Promise<Map<string, string>> | null = null;
        const resignedUrls = (): Promise<Map<string, string>> => {
            if (!resigning) {
                resigning = refresh!().then(
                    (fresh) => new Map(fresh.map((e) => [e.path, e.url] as const)),
                );
                resigning.catch(() => {
                    resigning = null;
                });
            }
            return resigning;
        };

        const failed = (entry: ZipEntry) =>
            new Error(`Téléchargement impossible : ${entry.path}`);

        /**
         * Fetch one track into a Blob, absorbing what is worth absorbing.
         *
         * Re-signing does not consume an attempt: an expired URL is not a
         * failure, it is the archive having outlived its links. A 4xx that is
         * not an expiry will be just as wrong on the next try, so only 5xx, 429
         * and outright network errors are repeated.
         */
        async function fetchTrack(entry: ZipEntry): Promise<Blob> {
            let url = entry.url;
            let attempt = 0;
            let resignedOnce = false;

            for (;;) {
                if (signal.aborted) throw abortError();

                let res: Response;
                try {
                    res = await fetch(url, { signal });
                } catch (e) {
                    if (signal.aborted) throw e;
                    if (++attempt >= GET_ATTEMPTS) throw failed(entry);
                    await sleep(backoffMs(attempt), signal);
                    continue;
                }

                if ((res.status === 401 || res.status === 403) && refresh && !resignedOnce) {
                    resignedOnce = true;
                    const fresh = (await resignedUrls()).get(entry.path);
                    if (fresh) {
                        url = fresh;
                        continue;
                    }
                }

                if (res.ok && res.body) {
                    // Counted per chunk, not per file: six tracks landing whole
                    // would move the bar in visible jumps of a track apiece.
                    let partial = 0;
                    const counting = new TransformStream<Uint8Array, Uint8Array>({
                        transform(chunk, ctrl) {
                            partial += chunk.byteLength;
                            pulled += chunk.byteLength;
                            reportPulled();
                            ctrl.enqueue(chunk);
                        },
                    });

                    try {
                        return await new Response(res.body.pipeThrough(counting)).blob();
                    } catch (e) {
                        // A connection that died mid-body: un-count what this
                        // attempt reported, or a retry would count those bytes
                        // twice and overshoot the total.
                        pulled -= partial;
                        if (signal.aborted) throw e;
                        if (++attempt >= GET_ATTEMPTS) throw failed(entry);
                        await sleep(backoffMs(attempt), signal);
                        continue;
                    }
                }

                const retryable = res.status >= 500 || res.status === 429;
                if (!retryable || ++attempt >= GET_ATTEMPTS) throw failed(entry);
                await sleep(backoffMs(attempt), signal);
            }
        }

        /**
         * Entries in their original order, each already downloaded (or nearly)
         * by the time the writer asks for it. `queue` is FIFO and only ever
         * appended to at the tail, which is what keeps the archive's order
         * identical to `entries`.
         */
        async function* files() {
            let next = 0;
            let inFlightBytes = 0;
            const queue: { entry: ZipEntry; blob: Promise<Blob> }[] = [];

            const fill = () => {
                while (
                    next < entries.length &&
                    queue.length < LOOKAHEAD_FILES &&
                    // An empty queue always starts one, however heavy: the
                    // budget must never be able to stall the archive.
                    (queue.length === 0 ||
                        inFlightBytes + entries[next].sizeBytes <= LOOKAHEAD_BYTES)
                ) {
                    const entry = entries[next++];
                    inFlightBytes += entry.sizeBytes;
                    const blob = fetchTrack(entry);
                    // The real await is below, in order, and still throws into
                    // the try/catch. This one only stops a later job's failure
                    // from being reported as an unhandled rejection while we are
                    // still waiting on an earlier one.
                    blob.catch(() => {});
                    queue.push({ entry, blob });
                }
            };

            fill();

            while (queue.length) {
                if (signal.aborted) return;
                const job = queue.shift()!;
                // The name of the track being written, not of one being
                // prefetched — that is what "Archivage…" claims.
                setCurrentName(job.entry.path);

                const blob = await job.blob;

                // The size below is the listing's, and it decides the entry's
                // Zip64 shape before a byte is written — so bytes that disagree
                // with it produce an archive whose headers describe something
                // other than its contents. A truncated body that still resolves
                // is the way that happens. Cheap to rule out now that what we
                // hold is a Blob and not a stream we never measured.
                if (blob.size !== job.entry.sizeBytes) throw failed(job.entry);

                inFlightBytes -= job.entry.sizeBytes;
                fill();

                if (signal.aborted) return;
                yield { name: job.entry.path, input: blob, size: job.entry.sizeBytes };
            }
        }

        const counter = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, ctrl) {
                count += chunk.byteLength;
                const now = Date.now();
                if (now - lastReport >= PROGRESS_INTERVAL_MS) {
                    lastReport = now;
                    setWritten(count);
                }
                ctrl.enqueue(chunk);
            },
        });

        try {
            const zipBody = downloadZip(files()).body;
            if (!zipBody) throw new Error('Archive illisible');
            const counted = zipBody.pipeThrough(counter);

            if (handle) {
                const writable = await handle.createWritable();
                await counted.pipeTo(writable, { signal });
            } else {
                const blob = await new Response(counted).blob();
                if (signal.aborted) return;
                const href = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = href;
                a.download = zipName;
                a.click();
                // Revoked late: Safari reads the blob after the click returns.
                setTimeout(() => URL.revokeObjectURL(href), 60_000);
            }

            setWritten(count);
            setFetched(pulled);
            setCurrentName(null);
            setPhase('done');
        } catch (e) {
            const aborted = signal.aborted || (e as Error)?.name === 'AbortError';
            setCurrentName(null);
            setPhase(aborted ? 'idle' : 'error');
            if (!aborted) {
                setError(e instanceof Error ? e.message : 'Échec du téléchargement');
            }
        } finally {
            abortRef.current = null;
        }
    }, []);

    return {
        phase,
        written,
        /** Bytes pulled from the bucket. Runs ahead of `written` — see files(). */
        fetched,
        total,
        currentName,
        error,
        /** True when the browser has no streaming sink and must buffer in RAM. */
        bufferedFallback: getSavePicker() === null,
        start,
        cancel,
        reset,
    };
}
