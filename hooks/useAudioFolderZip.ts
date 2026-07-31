'use client';

import { useCallback, useRef, useState } from 'react';
import { downloadZip } from 'client-zip';

/**
 * Zip a book's whole audio folder in the browser.
 *
 * Same principle as the upload path: the bytes go browser ↔ B2 and never touch
 * a Vercel function. Each track is fetched from its presigned GET URL and fed
 * straight into a zip stream, one at a time — a 40-track folder is several
 * gigabytes, which is precisely the transfer we refuse to pay for twice.
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

export function useAudioFolderZip() {
    const [phase, setPhase] = useState<ZipPhase>('idle');
    const [written, setWritten] = useState(0);
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
        setTotal(totalBytes);
        setCurrentName(entries[0]?.path ?? null);
        setError(null);

        let count = 0;
        let lastReport = 0;

        // Freshly signed URLs, fetched once and only if the bucket rejects one
        // as expired.
        let resigned: Map<string, string> | null = null;

        // Sequential on purpose: 40 parallel connections to the same bucket
        // gain nothing and make per-file progress meaningless.
        async function* files() {
            for (const entry of entries) {
                if (signal.aborted) return;
                setCurrentName(entry.path);

                let res = await fetch(entry.url, { signal });

                if ((res.status === 401 || res.status === 403) && refresh) {
                    if (!resigned) {
                        resigned = new Map(
                            (await refresh()).map((e) => [e.path, e.url] as const),
                        );
                    }
                    const fresh = resigned.get(entry.path);
                    if (fresh) res = await fetch(fresh, { signal });
                }

                if (!res.ok || !res.body) {
                    throw new Error(`Téléchargement impossible : ${entry.path}`);
                }
                yield { name: entry.path, input: res, size: entry.sizeBytes };
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
