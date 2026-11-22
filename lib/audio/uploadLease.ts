import 'server-only';
import { prisma } from '@/lib/prisma';
import { getUserNameOnly } from '@/lib/users/displayName';
import { parisDate } from '@/lib/paris-day';

/**
 * One upload at a time per book.
 *
 * `upload-url` names each new file from a listing of the folder: « the track
 * after the last one ». Nothing reserved that name while its presigned PUT was
 * valid (an hour), so two permanents — or one permanent in two tabs — adding
 * to the same book got the SAME next name, and the second PUT silently
 * replaced the first. The overwritten take survived only as a B2 noncurrent
 * version, for 30 days, and nothing said it had happened.
 *
 * So the first upload-url request of an upload claims the book, with a token
 * the dialogue drew for that upload (hooks/useAudioUpload.ts). Every later
 * request of the same upload carries the same token and renews the claim; any
 * other token is refused, naming who holds the book and until when. The
 * dialogue renews it every two minutes while it works and releases it at the
 * end (`POST /api/books/[id]/audio/upload-lease`).
 *
 * A tab that dies keeps the book for at most UPLOAD_LEASE_SECONDS. That is
 * safe because its PUTs died with it: a presigned URL is only ever held by the
 * browser it was handed to.
 *
 * No raw SQL: a conditional `updateMany`, then a `createMany` that skips a
 * duplicate (ON CONFLICT DO NOTHING) rather than raising one — this runs every
 * two minutes per upload, and a caught P2002 would still be logged each time.
 * Postgres re-checks the WHERE of an UPDATE under the row lock, so of two
 * uploads taking over the same expired claim exactly one matches; of two first
 * claims, exactly one row is inserted.
 */

/** How long a claim lives without being renewed. The dialogue renews every 2 min. */
export const UPLOAD_LEASE_SECONDS = 600;

/** A token is a browser `crypto.randomUUID()`; anything else is refused. */
export const isLeaseToken = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export type LeaseClaim =
    | { ok: true }
    | { ok: false; message: string; holder: { name: string; isMe: boolean }; until: string };

export async function claimUploadLease(bookId: number, userId: number, token: string): Promise<LeaseClaim> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const now = new Date(Date.now());
        const expiresAt = new Date(now.getTime() + UPLOAD_LEASE_SECONDS * 1000);
        // Ours to renew, or an expired one to take over.
        const taken = await prisma.audioUploadLease.updateMany({
            where: { bookId, OR: [{ token }, { expiresAt: { lt: now } }] },
            data: { token, userId, expiresAt },
        });
        if (taken.count === 1) return { ok: true };
        // No row at all: the first request of an upload.
        const created = await prisma.audioUploadLease.createMany({
            data: [{ bookId, token, userId, expiresAt }],
            skipDuplicates: true,
        });
        if (created.count === 1) return { ok: true };

        const held = await prisma.audioUploadLease.findUnique({
            where: { bookId },
            select: { userId: true, expiresAt: true },
        });
        // Released between the statements: claim it again from the start.
        if (!held) continue;
        return refusal(held.userId, userId, held.expiresAt);
    }
    // Two releases in a row under our feet: a busy book, not an error to hide.
    return refusal(null, userId, new Date(Date.now() + UPLOAD_LEASE_SECONDS * 1000));
}

/** The end of an upload. Only the holder's own token releases it. */
export async function releaseUploadLease(bookId: number, token: string): Promise<void> {
    await prisma.audioUploadLease.deleteMany({ where: { bookId, token } });
}

async function refusal(holderId: number | null, meId: number, until: Date): Promise<LeaseClaim> {
    const isMe = holderId === meId;
    const holder = holderId && !isMe
        ? await prisma.user.findUnique({
              where: { id: holderId },
              select: { firstName: true, lastName: true, email: true },
          })
        : null;
    const name = isMe ? 'vous' : getUserNameOnly(holder) || holder?.email || 'un autre permanent';
    const at = parisDate(until, { hour: '2-digit', minute: '2-digit' });
    const who = isMe
        ? 'Un autre envoi est déjà en cours sur ce livre depuis votre compte (un autre onglet ou une autre fenêtre).'
        : `${name.charAt(0).toUpperCase()}${name.slice(1)} envoie déjà des fichiers sur ce livre.`;
    return {
        ok: false,
        message:
            `${who} Deux envois en même temps dans le même dossier peuvent s’écraser l’un l’autre : ` +
            `attendez la fin de celui-ci. S’il a été interrompu, le livre se libère de lui-même à ${at}.`,
        holder: { name, isMe },
        until: until.toISOString(),
    };
}
