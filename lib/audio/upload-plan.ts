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
export function shouldPublishBook(opts: {
    replacing: boolean;
    isLastChunk: boolean;
    statuses: readonly string[];
}): boolean {
    return !opts.replacing && opts.isLastChunk && opts.statuses.every((s) => s === 'terminé');
}
