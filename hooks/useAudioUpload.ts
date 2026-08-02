'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Uploads audio files straight from the browser to the storage bucket.
 *
 * The server only mints presigned PUT URLs — the bytes go browser → B2 and
 * never transit Vercel. Three consequences shape this hook:
 *
 *  - `XMLHttpRequest`, not `fetch`: fetch cannot report upload progress, and a
 *    50 MB track with no progress bar looks like a hung dialogue.
 *  - the PUT must send exactly the Content-Type the server signed, or B2
 *    rejects the signature.
 *  - the server can't see the write, so a commit call afterwards verifies what
 *    actually landed and refreshes the book's cached track count.
 *
 * A failed preflight here almost always means the bucket is missing its CORS
 * rule for this origin — that case is detected and reported in plain French
 * rather than surfacing as a bare "Network error".
 */

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'finalising' | 'done' | 'error';

/**
 * `finalisation` is the phase the green bar cannot show.
 *
 * `xhr.upload` finishes when the last byte leaves the machine, but B2 only
 * answers once it has written the object — for a 50 MB track that gap is
 * minutes of apparent silence with a bar sitting at 100 %. Marking the row as
 * `finalisation` at that exact moment is what lets the UI say the wait is
 * expected instead of looking hung.
 */
export interface FileProgress {
    name: string;
    /** Name the server assigned in the bucket, once known. */
    assignedName?: string;
    loaded: number;
    total: number;
    status: 'en attente' | 'en cours' | 'finalisation' | 'terminé' | 'échec';
    error?: string;
}

export interface UploadOutcome {
    /** Every file in the batch landed and was verified. */
    ok: boolean;
    /**
     * The commit published the book (it was « en attente » and now has audio).
     * Returned rather than exposed as state: the caller reads it right after
     * awaiting `upload`, before React has re-rendered with a new state value.
     */
    becameAvailable: boolean;
}

/** Nothing landed — every early exit from `upload` returns this. */
const FAILED: UploadOutcome = { ok: false, becameAvailable: false };

interface SignedFile {
    originalName: string;
    filename: string;
    key: string;
    url: string;
    contentType: string;
}

/** How many files travel at once. Bounded so a big folder can't open 40 sockets. */
const CONCURRENCY = 3;

function putWithProgress(
    file: File,
    signed: SignedFile,
    onProgress: (loaded: number, total: number) => void,
    onSent: () => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', signed.url, true);
        // Must match the signature exactly.
        xhr.setRequestHeader('Content-Type', signed.contentType);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(e.loaded, e.total);
        };
        // Last byte handed to the network — B2 has not acknowledged anything
        // yet. Everything from here to `onload` is the silent wait.
        xhr.upload.onload = () => onSent();
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Le stockage a refusé l’envoi (HTTP ${xhr.status})`));
        };
        // A blocked CORS preflight arrives here as a status-0 "error" with no
        // detail, which is otherwise impossible to diagnose from the UI.
        xhr.onerror = () =>
            reject(
                new Error(
                    'Envoi bloqué par le navigateur. Le bucket B2 doit autoriser ' +
                        '« s3_put » depuis cette adresse (règle CORS).',
                ),
            );
        xhr.onabort = () => reject(new Error('Envoi annulé'));
        xhr.send(file);
    });
}

export function useAudioUpload(bookId: number) {
    const [phase, setPhase] = useState<UploadPhase>('idle');
    const [progress, setProgress] = useState<FileProgress[]>([]);
    const [error, setError] = useState<string | null>(null);
    /** Set when the book has no folder and the admin must approve creating one. */
    const [needsFolder, setNeedsFolder] = useState<string | null>(null);

    const progressRef = useRef<FileProgress[]>([]);

    const publish = useCallback(() => {
        setProgress([...progressRef.current]);
    }, []);

    const reset = useCallback(() => {
        progressRef.current = [];
        setProgress([]);
        setError(null);
        setNeedsFolder(null);
        setPhase('idle');
    }, []);

    /**
     * @param createFolder approve creating the book's audio folder — only set
     *        after the admin has confirmed the proposed prefix.
     */
    const upload = useCallback(
        async (files: File[], createFolder = false): Promise<UploadOutcome> => {
            if (!files.length) return FAILED;

            setError(null);
            setNeedsFolder(null);
            setPhase('preparing');

            progressRef.current = files.map((f) => ({
                name: f.name,
                loaded: 0,
                total: f.size,
                status: 'en attente' as const,
            }));
            publish();

            // --- 1. Ask the server to name and sign each file -----------------
            let signed: SignedFile[];
            try {
                const res = await fetch(`/api/books/${bookId}/audio/upload-url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        createFolder,
                        files: files.map((f) => ({ name: f.name, size: f.size })),
                    }),
                });
                const data = await res.json().catch(() => null);

                if (res.status === 409 && data?.needsFolder) {
                    setNeedsFolder(data.proposedPrefix ?? '');
                    setPhase('idle');
                    return FAILED;
                }
                if (!res.ok) throw new Error(data?.message || 'Préparation de l’envoi impossible');
                signed = data.files as SignedFile[];
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Erreur inattendue');
                setPhase('error');
                return FAILED;
            }

            // Pair each File with its signature by the name we sent.
            const byName = new Map(files.map((f) => [f.name, f]));
            for (const s of signed) {
                const row = progressRef.current.find((p) => p.name === s.originalName);
                if (row) row.assignedName = s.filename;
            }
            publish();

            // --- 2. PUT straight to the bucket -------------------------------
            setPhase('uploading');
            const succeeded: { key: string; size: number }[] = [];
            let queue = 0;

            const worker = async () => {
                for (;;) {
                    const index = queue++;
                    if (index >= signed.length) return;
                    const s = signed[index];
                    const file = byName.get(s.originalName);
                    const row = progressRef.current.find((p) => p.name === s.originalName);
                    if (!file || !row) continue;

                    row.status = 'en cours';
                    publish();
                    try {
                        await putWithProgress(
                            file,
                            s,
                            (loaded, total) => {
                                row.loaded = loaded;
                                row.total = total;
                                publish();
                            },
                            () => {
                                row.status = 'finalisation';
                                publish();
                            },
                        );
                        row.status = 'terminé';
                        row.loaded = row.total;
                        succeeded.push({ key: s.key, size: file.size });
                    } catch (e) {
                        row.status = 'échec';
                        row.error = e instanceof Error ? e.message : 'Échec';
                    }
                    publish();
                }
            };

            await Promise.all(
                Array.from({ length: Math.min(CONCURRENCY, signed.length) }, worker),
            );

            // --- 3. Let the server verify and refresh the cached counters -----
            setPhase('finalising');
            let becameAvailable = false;
            try {
                const res = await fetch(`/api/books/${bookId}/audio/commit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uploaded: succeeded }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) throw new Error(data?.message || 'Vérification impossible');

                becameAvailable = data?.becameAvailable === true;

                for (const f of (data?.failed ?? []) as { key: string; reason: string }[]) {
                    const name = f.key.split('/').pop();
                    const row = progressRef.current.find((p) => p.assignedName === name);
                    if (row) {
                        row.status = 'échec';
                        row.error = f.reason;
                    }
                }
                publish();
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Vérification impossible');
                setPhase('error');
                return FAILED;
            }

            const anyFailed = progressRef.current.some((p) => p.status === 'échec');
            setPhase(anyFailed ? 'error' : 'done');
            if (anyFailed) setError('Certains fichiers n’ont pas pu être envoyés.');
            return { ok: !anyFailed, becameAvailable };
        },
        [bookId, publish],
    );

    return { phase, progress, error, needsFolder, upload, reset };
}
