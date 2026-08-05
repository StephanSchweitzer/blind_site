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
 * ## Why this file is so defensive
 *
 * B2 answers a share of PUTs with 500/503 **by design**: a dispatching server
 * hands each request to a storage vault, and a vault that is full or offline
 * replies 5xx to say "ask for another one". Backblaze's own guidance is to
 * retry; on the S3-compatible API the re-dispatch happens server-side, so
 * repeating the same presigned PUT lands on a different vault. Every AWS SDK
 * does this silently — uploading from the browser bypasses the SDK, so the
 * retry layer every normal S3 client has must be built here instead.
 *
 * The rule this file follows: an admin who picks a folder should not have to do
 * anything else. Anything transient is absorbed — retried PUTs, retried signing,
 * retried verification, and a second full pass for files the server could not
 * confirm. Anything that survives all of that is reported per file with the
 * original filename and a sentence saying what to do about it.
 */

export type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'finalising' | 'done' | 'error';

export type FileStatus =
    | 'en attente'
    | 'en cours'
    | 'finalisation'
    | 'nouvelle tentative'
    | 'terminé'
    | 'échec';

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
    status: FileStatus;
    error?: string;
    /**
     * What the admin should actually *do* about this failure, in French.
     * Always set alongside `error` — an error message the reader cannot act on
     * is how a folder ends up half-uploaded and abandoned.
     */
    hint?: string;
    /** Transfers attempted in the current pass, 1-based. */
    attempts: number;
    /** Which upload pass this row is on; 1 is the original attempt. */
    pass: number;
    /** Whether another pass could plausibly succeed. Internal to the hook. */
    recoverable?: boolean;
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
    /** Files that needed more than one attempt but did land. For the summary. */
    recovered: number;
    /**
     * Demandes whose tarif the commit realigned on the new weight. Reported so
     * the admin learns money moved from the same toast, rather than discovering
     * it on a facture later. A batch over MAX_FILES_PER_CHUNK commits more than
     * once and each commit re-tarifies at the weight known so far; the last
     * count is the one that matches the finished folder.
     */
    repriced: number;
}

/** Nothing landed — every early exit from `upload` returns this. */
const FAILED: UploadOutcome = { ok: false, becameAvailable: false, recovered: 0, repriced: 0 };

interface SignedFile {
    originalName: string;
    filename: string;
    key: string;
    url: string;
    contentType: string;
}

/** How many files travel at once. Bounded so a big folder can't open 40 sockets. */
const CONCURRENCY = 3;

/**
 * How many files are signed per request. Must not exceed `MAX_FILES_PER_REQUEST`
 * in `app/api/books/[id]/audio/upload-url/route.ts`.
 *
 * Chunks run **sequentially**, and that is not a throughput choice: the names in
 * a chunk are computed from what the bucket already holds, so a chunk has to be
 * uploaded and committed before the next one is signed. Signing two chunks up
 * front would hand both the same starting number and collide. Sequential chunks
 * also keep every presigned URL well inside its one-hour life, which a single
 * multi-gigabyte batch would not.
 */
const MAX_FILES_PER_CHUNK = 50;

/** Transfer attempts per file within one pass. */
const PUT_ATTEMPTS = 3;
/** Attempts for the JSON calls to our own API (signing, verification). */
const FETCH_ATTEMPTS = 3;

const RETRY_BASE_MS = 700;
const MAX_BACKOFF_MS = 15_000;

/**
 * No bytes moved for this long mid-transfer means the connection is gone.
 *
 * A fixed `xhr.timeout` cannot express this: 60 seconds is far too short for a
 * 500 MB track and far too long for a dead socket. What distinguishes the two is
 * whether bytes are still moving, so the clock is reset by every progress event
 * and only fires when the transfer has genuinely stalled.
 */
const STALL_TIMEOUT_MS = 60_000;

/**
 * Ceiling on B2's silent acknowledgement after the last byte is sent.
 *
 * Generous, because this wait is legitimately minutes on a large object. It
 * exists only so a connection that dies during that silence cannot hang the
 * dialogue for ever — which matters more than usual here, since the dialogue
 * deliberately refuses to close while an upload is in flight.
 */
const ACK_TIMEOUT_MS = 10 * 60_000;

/**
 * Extra full passes for files the verification step could not confirm.
 *
 * A file can PUT successfully and still be missing or truncated in the bucket.
 * Re-running signing and transfer for just those files is the difference between
 * the system fixing itself and an admin hunting for which 2 of 60 tracks are
 * missing.
 */
const RECOVERY_PASSES = 2;

/** Pause between passes, so whatever was wrong has a moment to clear. */
const PASS_PAUSE_MS = 2_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Equal-jitter exponential backoff.
 *
 * The jitter is not decoration: three workers tripping over the same B2 hiccup
 * would otherwise retry in lockstep and collide again. Spreading them is what
 * breaks the synchronisation.
 */
function backoffMs(attempt: number, retryAfterSec?: number): number {
    if (retryAfterSec && retryAfterSec > 0) {
        return Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS);
    }
    const base = Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    return base / 2 + Math.random() * (base / 2);
}

/**
 * `Retry-After` when the responder bothered to send one.
 *
 * Opportunistic by necessity: a cross-origin response only exposes headers the
 * bucket lists in its CORS rule, so this is often null even when B2 sent it.
 * When present it beats guessing; when absent we fall back to backoff.
 */
function retryAfterSeconds(get: (name: string) => string | null): number | undefined {
    const raw = get('Retry-After');
    if (!raw) return undefined;
    const secs = Number(raw);
    if (Number.isFinite(secs)) return secs;
    const when = Date.parse(raw);
    return Number.isFinite(when) ? Math.max(0, (when - Date.now()) / 1000) : undefined;
}

/**
 * A failed PUT, carrying whether trying again could plausibly work and what the
 * admin should do if it never does.
 *
 * The retryable distinction is the whole point: a 403 means the signature is
 * wrong and will be wrong every time, while a 500 means B2 had a bad moment.
 * Retrying the first wastes the admin's time and hides the real problem; not
 * retrying the second loses a track for no reason.
 */
class PutError extends Error {
    constructor(
        message: string,
        readonly retryable: boolean,
        readonly hint: string,
        readonly retryAfterSec?: number,
    ) {
        super(message);
        this.name = 'PutError';
    }
}

const HINT_CONNECTION =
    'Vérifiez votre connexion internet, puis relancez les fichiers en échec avec le ' +
    'bouton ci-dessous. Aucun autre fichier ne sera renvoyé.';
const HINT_TRANSIENT =
    'Le stockage a eu un incident passager. Attendez une minute puis relancez les ' +
    'fichiers en échec avec le bouton ci-dessous.';
const HINT_CONFIG =
    'Ce n’est pas un problème de fichier ni de connexion : la configuration du ' +
    'stockage est en cause. Signalez-le à l’informaticien en citant le code ci-dessus.';

interface PutCallbacks {
    onProgress: (loaded: number, total: number) => void;
    onSent: () => void;
}

function putOnce(file: File, signed: SignedFile, cbs: PutCallbacks): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        let abortedBy: 'stall' | 'ack' | null = null;

        const arm = (ms: number, reason: 'stall' | 'ack') => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => {
                abortedBy = reason;
                xhr.abort();
            }, ms);
        };
        const disarm = () => clearTimeout(watchdog);

        xhr.open('PUT', signed.url, true);
        // Must match the signature exactly.
        xhr.setRequestHeader('Content-Type', signed.contentType);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) cbs.onProgress(e.loaded, e.total);
            // Every byte pushes the deadline back — see STALL_TIMEOUT_MS.
            arm(STALL_TIMEOUT_MS, 'stall');
        };
        // Last byte handed to the network — B2 has not acknowledged anything
        // yet. Everything from here to `onload` is the silent wait.
        xhr.upload.onload = () => {
            cbs.onSent();
            arm(ACK_TIMEOUT_MS, 'ack');
        };

        xhr.onload = () => {
            disarm();
            if (xhr.status >= 200 && xhr.status < 300) return resolve();

            // 5xx is B2 shedding load (a full or offline vault, which the next
            // request gets re-dispatched away from), 429 is B2 asking us to slow
            // down — both pass with another attempt. A 4xx is our own request
            // being wrong, and will be just as wrong next time.
            const retryable = xhr.status >= 500 || xhr.status === 429;
            reject(
                new PutError(
                    `Le stockage a refusé l’envoi (HTTP ${xhr.status})`,
                    retryable,
                    retryable ? HINT_TRANSIENT : HINT_CONFIG,
                    retryAfterSeconds((h) => xhr.getResponseHeader(h)),
                ),
            );
        };

        // A blocked CORS preflight arrives here as a status-0 "error" with no
        // detail, which is otherwise impossible to diagnose from the UI.
        //
        // A dropped connection is indistinguishable from it, so this is treated
        // as retryable: a genuine CORS misconfiguration simply fails all three
        // attempts and still reports this same message.
        xhr.onerror = () => {
            disarm();
            reject(
                new PutError(
                    'Envoi bloqué par le navigateur ou connexion interrompue.',
                    true,
                    'Si TOUS les fichiers échouent ainsi, le bucket doit autoriser ' +
                        '« s3_put » depuis cette adresse (règle CORS) : prévenez ' +
                        'l’informaticien. Si seuls quelques fichiers échouent, c’est la ' +
                        'connexion : relancez-les avec le bouton ci-dessous.',
                ),
            );
        };

        xhr.onabort = () => {
            disarm();
            if (abortedBy === 'stall') {
                return reject(
                    new PutError(
                        'Envoi interrompu : plus aucune donnée transmise pendant 60 secondes.',
                        true,
                        HINT_CONNECTION,
                    ),
                );
            }
            if (abortedBy === 'ack') {
                return reject(
                    new PutError(
                        'Le stockage n’a pas confirmé l’enregistrement dans le délai imparti.',
                        true,
                        'Le fichier est peut-être arrivé malgré tout. Rouvrez cette fenêtre ' +
                            'et vérifiez la liste des pistes avant de le renvoyer, pour ne pas ' +
                            'créer de doublon.',
                    ),
                );
            }
            reject(new PutError('Envoi annulé', false, HINT_CONNECTION));
        };

        // Covers the connection phase too: a socket that never opens produces no
        // progress event at all, so the first deadline is armed before sending.
        arm(STALL_TIMEOUT_MS, 'stall');
        xhr.send(file);
    });
}

/**
 * Upload one file, retrying the failures that are worth retrying.
 *
 * A retry re-sends the identical body to the identical key. The bucket keeps
 * versions, so the worst case of a retry that turns out to have been unnecessary
 * — the first PUT having landed while its response was lost — is a superseded
 * version of a byte-identical object, not a corrupt or duplicated track.
 */
async function putWithRetry(
    file: File,
    signed: SignedFile,
    row: FileProgress,
    publish: () => void,
): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        // Each attempt restarts the transfer, so the bar restarts with it —
        // leaving it where the failed attempt died would overstate progress.
        row.attempts = attempt;
        row.loaded = 0;
        row.status = 'en cours';
        publish();

        try {
            await putOnce(file, signed, {
                onProgress: (loaded, total) => {
                    row.loaded = loaded;
                    row.total = total;
                    publish();
                },
                onSent: () => {
                    row.status = 'finalisation';
                    publish();
                },
            });
            return;
        } catch (e) {
            const err = e instanceof PutError ? e : null;
            if (!err?.retryable || attempt >= PUT_ATTEMPTS) throw e;

            // Named so the row can say "waiting to try again" rather than sit
            // on a stalled-looking bar for up to fifteen seconds.
            row.status = 'nouvelle tentative';
            publish();
            await sleep(backoffMs(attempt, err.retryAfterSec));
        }
    }
}

interface JsonResult {
    res: Response;
    data: { [k: string]: unknown } | null;
}

/**
 * Our own API calls, with the same retry discipline as the transfers.
 *
 * Signing and verification are single points of failure for a whole chunk: one
 * hiccup on `upload-url` used to abandon fifty files, and one on `commit` used
 * to report a batch as failed that was sitting complete in the bucket. Both are
 * safe to repeat — signing recomputes names from the bucket, and verification
 * only re-reads it.
 *
 * 4xx answers are returned untouched on the first try: `409 needsFolder` is a
 * question for the admin, not a failure, and retrying it would only delay the
 * prompt.
 */
async function fetchJsonWithRetry(url: string, init: RequestInit): Promise<JsonResult> {
    let lastNetworkError: unknown = null;

    for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
        try {
            const res = await fetch(url, init);
            const data = (await res.json().catch(() => null)) as JsonResult['data'];

            const verdictIsFinal =
                res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
            if (verdictIsFinal || attempt === FETCH_ATTEMPTS) return { res, data };

            await sleep(backoffMs(attempt, retryAfterSeconds((h) => res.headers.get(h))));
        } catch (e) {
            lastNetworkError = e;
            if (attempt === FETCH_ATTEMPTS) break;
            await sleep(backoffMs(attempt));
        }
    }

    throw new Error(
        lastNetworkError instanceof Error && lastNetworkError.message
            ? `Le serveur est injoignable (${lastNetworkError.message})`
            : 'Le serveur est injoignable',
    );
}

export function useAudioUpload(bookId: number) {
    const [phase, setPhase] = useState<UploadPhase>('idle');
    const [progress, setProgress] = useState<FileProgress[]>([]);
    const [error, setError] = useState<string | null>(null);
    /** Set when the book has no folder and the admin must approve creating one. */
    const [needsFolder, setNeedsFolder] = useState<string | null>(null);
    /**
     * The files that did not make it, kept so the UI can offer to send exactly
     * those again — re-picking the folder would re-send everything.
     */
    const [failedFiles, setFailedFiles] = useState<File[]>([]);

    const progressRef = useRef<FileProgress[]>([]);

    const publish = useCallback(() => {
        setProgress([...progressRef.current]);
    }, []);

    const reset = useCallback(() => {
        progressRef.current = [];
        setProgress([]);
        setError(null);
        setNeedsFolder(null);
        setFailedFiles([]);
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
            setFailedFiles([]);
            setPhase('preparing');

            progressRef.current = files.map((f) => ({
                name: f.name,
                loaded: 0,
                total: f.size,
                status: 'en attente' as const,
                attempts: 0,
                pass: 1,
            }));
            publish();

            // Names are unique: a selection always comes from one folder.
            const byName = new Map(files.map((f) => [f.name, f]));
            const rowOf = (name: string) => progressRef.current.find((p) => p.name === name);

            const fail = (name: string, message: string, hint: string, recoverable: boolean) => {
                const row = rowOf(name);
                if (!row) return;
                row.status = 'échec';
                row.error = message;
                row.hint = hint;
                row.recoverable = recoverable;
            };

            let becameAvailable = false;
            let repriced = 0;
            let aborted = false;
            let pending = files;

            for (let pass = 1; pass <= 1 + RECOVERY_PASSES && pending.length && !aborted; pass++) {
                if (pass > 1) await sleep(PASS_PAUSE_MS);

                for (const f of pending) {
                    const row = rowOf(f.name);
                    if (!row) continue;
                    row.pass = pass;
                    row.attempts = 0;
                    row.loaded = 0;
                    row.status = 'en attente';
                    row.error = undefined;
                    row.hint = undefined;
                    row.recoverable = undefined;
                }
                publish();

                const chunks: File[][] = [];
                for (let i = 0; i < pending.length; i += MAX_FILES_PER_CHUNK) {
                    chunks.push(pending.slice(i, i + MAX_FILES_PER_CHUNK));
                }

                for (let c = 0; c < chunks.length; c++) {
                    const chunk = chunks[c];
                    const downstream = chunks.slice(c + 1).flat();

                    // --- 1. Ask the server to name and sign each file ---------
                    setPhase('preparing');
                    let signed: SignedFile[];
                    try {
                        const { res, data } = await fetchJsonWithRetry(
                            `/api/books/${bookId}/audio/upload-url`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    // Only the first chunk of the first pass can
                                    // need this; afterwards the folder exists.
                                    createFolder,
                                    files: chunk.map((f) => ({ name: f.name, size: f.size })),
                                }),
                            },
                        );

                        if (res.status === 409 && data?.needsFolder) {
                            setNeedsFolder(String(data.proposedPrefix ?? ''));
                            setPhase('idle');
                            return FAILED;
                        }
                        if (!res.ok) {
                            throw new Error(
                                String(data?.message ?? 'Préparation de l’envoi impossible'),
                            );
                        }
                        signed = (data?.files ?? []) as SignedFile[];
                    } catch (e) {
                        // Signing is per-chunk, so this kills this chunk and
                        // everything queued behind it — but not what already
                        // landed, and not the retry offer.
                        const message = e instanceof Error ? e.message : 'Erreur inattendue';
                        for (const f of [...chunk, ...downstream]) {
                            fail(
                                f.name,
                                message,
                                'La préparation de l’envoi a échoué côté serveur. Relancez ' +
                                    'les fichiers en échec avec le bouton ci-dessous ; s’ils ' +
                                    'échouent encore, prévenez l’informaticien.',
                                true,
                            );
                        }
                        publish();
                        setError(message);
                        aborted = true;
                        break;
                    }

                    for (const s of signed) {
                        const row = rowOf(s.originalName);
                        if (row) row.assignedName = s.filename;
                    }
                    // A signature the server didn't return for is a file that
                    // would otherwise sit at « en attente » for ever and be
                    // dropped silently — the one outcome worse than a failure.
                    const signedNames = new Set(signed.map((s) => s.originalName));
                    for (const f of chunk.filter((f) => !signedNames.has(f.name))) {
                        fail(
                            f.name,
                            'Le serveur n’a pas préparé l’envoi de ce fichier.',
                            'Relancez-le avec le bouton ci-dessous. S’il échoue à nouveau, ' +
                                'renommez-le (accents ou caractères inhabituels) avant de réessayer.',
                            true,
                        );
                    }
                    publish();

                    // --- 2. PUT straight to the bucket -----------------------
                    setPhase('uploading');
                    const sent: { key: string; size: number; name: string }[] = [];
                    let queue = 0;

                    const worker = async () => {
                        for (;;) {
                            const index = queue++;
                            if (index >= signed.length) return;
                            const s = signed[index];
                            const file = byName.get(s.originalName);
                            const row = rowOf(s.originalName);
                            if (!file || !row) continue;

                            try {
                                await putWithRetry(file, s, row, publish);
                                row.status = 'terminé';
                                row.loaded = row.total;
                                sent.push({ key: s.key, size: file.size, name: s.originalName });
                            } catch (e) {
                                const err = e instanceof PutError ? e : null;
                                fail(
                                    s.originalName,
                                    err?.message ?? 'Échec de l’envoi',
                                    err?.hint ?? HINT_CONNECTION,
                                    err?.retryable ?? false,
                                );
                            }
                            publish();
                        }
                    };

                    await Promise.all(
                        Array.from({ length: Math.min(CONCURRENCY, signed.length) }, worker),
                    );

                    // --- 3. Let the server verify and refresh the counters ----
                    //
                    // This has to complete before the next chunk is signed: the
                    // names in that chunk are derived from the folder's
                    // contents, which only now include what just landed.
                    setPhase('finalising');
                    try {
                        const { res, data } = await fetchJsonWithRetry(
                            `/api/books/${bookId}/audio/commit`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    uploaded: sent.map(({ key, size }) => ({ key, size })),
                                }),
                            },
                        );
                        if (!res.ok) {
                            throw new Error(String(data?.message ?? 'Vérification impossible'));
                        }

                        if (data?.becameAvailable === true) becameAvailable = true;
                        // Overwrite rather than accumulate: each chunk re-tarifies
                        // the same demandes, so summing would count them twice.
                        if (typeof data?.repriced === 'number' && data.repriced > 0) {
                            repriced = data.repriced;
                        }

                        // A file that transferred cleanly can still be absent or
                        // truncated in the bucket. Those are marked recoverable
                        // so the next pass re-sends them by itself.
                        for (const f of (data?.failed ?? []) as { key: string; reason: string }[]) {
                            const assigned = f.key.split('/').pop();
                            const row = progressRef.current.find((p) => p.assignedName === assigned);
                            if (!row) continue;
                            row.status = 'échec';
                            row.error = f.reason;
                            // Worded to hold true either way: a recovery pass
                            // usually clears this before anyone reads it, and if
                            // it doesn't, the instruction is still the right one.
                            row.hint =
                                'Le fichier n’est pas arrivé complet dans le stockage. ' +
                                'Relancez-le avec le bouton ci-dessous.';
                            row.recoverable = true;
                        }
                        publish();
                    } catch (e) {
                        // The transfers may well have landed — it is the
                        // verification that failed, and the folder listing after
                        // closing is what shows the truth. Marking them
                        // recoverable lets the next pass settle it: anything
                        // already in the bucket keeps its place, anything
                        // missing gets sent again.
                        const message = e instanceof Error ? e.message : 'Vérification impossible';
                        for (const s of sent) {
                            fail(
                                s.name,
                                message,
                                'L’envoi a réussi mais la vérification n’a pas abouti. ' +
                                    'Le fichier est probablement déjà en ligne : rouvrez cette ' +
                                    'fenêtre pour vérifier la liste des pistes.',
                                true,
                            );
                        }
                        for (const f of downstream) {
                            fail(f.name, 'Envoi interrompu', HINT_TRANSIENT, true);
                        }
                        publish();
                        setError(message);
                        aborted = true;
                        break;
                    }
                }

                // Whatever is still failing and could plausibly work goes round
                // again. This is what makes a transient hiccup invisible.
                pending = progressRef.current
                    .filter((p) => p.status === 'échec' && p.recoverable)
                    .map((p) => byName.get(p.name))
                    .filter((f): f is File => Boolean(f));

                // A hard abort (signing or verification dead) still gets the
                // remaining passes — the server being briefly unreachable is
                // exactly the kind of thing that clears on its own.
                if (aborted && pass < 1 + RECOVERY_PASSES) aborted = false;
            }

            const rows = progressRef.current;
            const stillFailed = rows.filter((p) => p.status === 'échec');
            const recovered = rows.filter(
                (p) => p.status === 'terminé' && (p.attempts > 1 || p.pass > 1),
            ).length;

            setFailedFiles(
                stillFailed.map((p) => byName.get(p.name)).filter((f): f is File => Boolean(f)),
            );

            if (stillFailed.length) {
                setPhase('error');
                setError(
                    `${stillFailed.length} fichier${stillFailed.length > 1 ? 's' : ''} sur ` +
                        `${files.length} n’${stillFailed.length > 1 ? 'ont' : 'a'} pas pu être ` +
                        'envoyé' +
                        (stillFailed.length > 1 ? 's' : '') +
                        '. Le détail et la marche à suivre sont indiqués pour chacun ci-dessous.',
                );
                return { ok: false, becameAvailable, recovered, repriced };
            }

            setPhase('done');
            return { ok: true, becameAvailable, recovered, repriced };
        },
        [bookId, publish],
    );

    return { phase, progress, error, needsFolder, failedFiles, upload, reset };
}
