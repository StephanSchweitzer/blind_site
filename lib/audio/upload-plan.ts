/**
 * The decisions of the upload dialogue (hooks/useAudioUpload.ts) that are worth
 * a test of their own, kept free of React and the browser so that
 * scripts/audio-fake-bucket.test.ts can run them under Node.
 */

/**
 * A URL this close to expiry is signed again before a PUT starts on it.
 *
 * URLs live as long as the upload's claim on the book (ten minutes, see
 * upload-url's URL_TTL_SECONDS): a chunk of fifty files three at a time can
 * reach its last files later than that, and a tab woken from sleep holds URLs
 * signed before someone else may have taken the book. Re-signing goes through
 * upload-url with `existingKey` — same key when it is still free — and renews
 * the claim on the way, or answers 409 because the book is someone else's now.
 * A PUT already under way is unaffected: expiry is checked when it starts.
 */
export const RESIGN_MARGIN_MS = 120_000;

export function needsResign(signed: { signedAt: number; ttlMs: number }, now: number): boolean {
    return now >= signed.signedAt + signed.ttlMs - RESIGN_MARGIN_MS;
}

/**
 * Whether this commit may publish a book « en attente » (the commit route
 * checks the rest: every file confirmed, status OK).
 *
 * Only on the LAST chunk of a pass, once every file of the upload has settled
 * as « terminé » — sent, already at its key, or found already in the folder.
 * An earlier `sent.length === chunk.length` ignored the files the server found
 * already present, so a complete upload never published.
 *
 * Never on « Remplacer »: a re-take is not the end of a recording. After
 * « Rouvrir l'attribution », re-taking one chapter published a reading known to
 * be incomplete.
 */
/**
 * Whether the upload is in its silent tail — every byte of the batch sent, the
 * storage (or the commit) still to answer — which is what the editor's
 * « Préparation de l’audio dans le cloud » panel says.
 *
 * It used to be « any file waiting on the storage, or a commit under way ».
 * Three transfers at a time on a folder of small tracks put a file in that wait
 * every few hundred milliseconds and took it out again, and every chunk's commit
 * did the same between two hashings: the panel mounted and unmounted dozens of
 * times a minute, the list under it jumping each time, its clock back at 0:00.
 * And its « Vos fichiers ont quitté votre ordinateur » was false at every one
 * of those moments but the last.
 *
 * So nothing may still be waiting to go, going, or about to go again. Once that
 * holds it stays held until the upload ends — unless a recovery pass really
 * does send files again, which is the one time the panel should give way.
 * `uploading` counts as well as `finalising`: between the last file's answer
 * and the commit there is a render with every row settled and the phase not yet
 * moved, and leaving it out unmounted the panel for that one frame.
 */
export function isCloudFinalising(phase: string, statuses: readonly string[]): boolean {
    if (!statuses.length || (phase !== 'uploading' && phase !== 'finalising')) return false;
    return statuses.every((s) => s === 'finalisation' || s === 'terminé' || s === 'échec');
}

export function shouldPublishBook(opts: {
    replacing: boolean;
    isLastChunk: boolean;
    statuses: readonly string[];
}): boolean {
    return !opts.replacing && opts.isLastChunk && opts.statuses.every((s) => s === 'terminé');
}
