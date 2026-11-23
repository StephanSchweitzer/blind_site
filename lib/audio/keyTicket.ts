import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proof that `upload-url` itself handed this key to this book's upload.
 *
 * Two requests take a key back from the browser and act on it beyond what the
 * folder shows:
 *  - a retry's `existingKey` that is ABSENT from the folder is signed again as
 *    is — skipping nextTrackName, which is what guarantees a new track sorts
 *    after the others. Legitimate for the key an earlier signing assigned (its
 *    PUT never landed), but a crafted request could name any free key and so
 *    place a file anywhere in the playing order;
 *  - `commit` records the browser's reading of a track's duration on its UPLOAD
 *    event. For a key that was never uploaded through the portal — a legacy
 *    track — a crafted duration fed the public reading time until measured.
 *
 * Neither needs a table: the key is returned with an HMAC over (book, key,
 * time), keyed on the session secret the server already holds. A present key
 * holding the file's own bytes needs no ticket (`landed`): its SHA-256 proves it.
 */

/** A « Renvoyer » can come well after the upload, but not days after. */
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): string {
    const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
    if (!s) throw new Error('NEXTAUTH_SECRET manquant : impossible de signer les clés d’envoi.');
    return s;
}

function mac(bookId: number, key: string, issuedAt: number): string {
    return createHmac('sha256', secret()).update(`${bookId}\n${key}\n${issuedAt}`).digest('base64url');
}

export function issueKeyTicket(bookId: number, key: string): string {
    const issuedAt = Date.now();
    return `${issuedAt}.${mac(bookId, key, issuedAt)}`;
}

export function verifyKeyTicket(bookId: number, key: string, ticket: unknown): boolean {
    if (typeof ticket !== 'string') return false;
    const dot = ticket.indexOf('.');
    const issuedAt = Number(ticket.slice(0, dot));
    if (dot < 1 || !Number.isSafeInteger(issuedAt)) return false;
    const age = Date.now() - issuedAt;
    if (age < 0 || age > TICKET_TTL_MS) return false;
    const given = Buffer.from(ticket.slice(dot + 1));
    const expected = Buffer.from(mac(bookId, key, issuedAt));
    return given.length === expected.length && timingSafeEqual(given, expected);
}
