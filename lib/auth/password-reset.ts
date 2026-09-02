import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isAdmin } from '@/lib/auth/guards';
import { isSendableEmail } from '@/lib/email/sendEmail';

/**
 * Self-service password reset, for permanents only.
 *
 * Why this exists: permanents lock themselves out regularly, and the only other
 * way back in is a super admin running /api/user/[id]/reset-password for them.
 * This lets them do it alone WITHOUT opening a public account-recovery surface:
 *
 *  - a link is only ever issued for an account that already exists AND already
 *    has `accessLevel` admin/super_admin — never for a member, never for an
 *    unknown address, and it can never create an account;
 *  - the request endpoint answers identically in every case, so it cannot be
 *    used to find out who has an account or who is a permanent;
 *  - nothing changes until the link is opened, so anyone spamming the form with
 *    someone else's address cannot lock that person out — their current
 *    password keeps working.
 */

/** How long a reset link stays valid. Short: the mailbox is the only gate. */
export const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Only the SHA-256 of a link's secret is stored, so the table is useless to
 * anyone who reads it: a row cannot be turned back into a working link.
 * A plain hash (no bcrypt) is right here — the secret is 256 bits of CSPRNG
 * output, so there is nothing to brute-force, and the lookup must be indexed.
 */
export function hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** The account states that may receive a reset link. */
export type ResetCandidate = { id: number; email: string | null; accessLevel: string };

export function mayResetOwnPassword(user: ResetCandidate | null): user is ResetCandidate {
    return !!user && isAdmin(user.accessLevel) && isSendableEmail(user.email);
}

/**
 * Issues a fresh link for a user and returns the secret (the only time it
 * exists in plaintext — it goes straight into the email and is never logged).
 *
 * Earlier tokens for the same user are dropped: requesting a new link
 * invalidates the previous one, and the table never accumulates rows.
 */
export async function createResetToken(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId } }),
        prisma.passwordResetToken.create({
            data: {
                userId,
                tokenHash: hashResetToken(token),
                expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
            },
        }),
    ]);

    return token;
}

export type ResolvedToken =
    | { ok: true; tokenId: number; user: ResetCandidate & { firstName: string | null; lastName: string | null; name: string | null } }
    | { ok: false };

/**
 * Resolves a link's secret to the account it unlocks, or fails.
 *
 * Every failure returns the same bare `{ ok: false }` — expired, already used,
 * unknown, or an account that has since lost its permanent access all look
 * alike to the caller, so an old link never reveals what happened to it.
 * Re-checking the access level here matters: a link issued yesterday must not
 * still work for someone demoted since.
 */
export async function resolveResetToken(token: string | null | undefined): Promise<ResolvedToken> {
    const raw = token?.trim();
    if (!raw) return { ok: false };

    const row = await prisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(raw) },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    accessLevel: true,
                    deletedAt: true,
                    firstName: true,
                    lastName: true,
                    name: true,
                },
            },
        },
    });

    if (!row || row.usedAt || row.expiresAt <= new Date()) return { ok: false };
    // findUnique is NOT covered by the soft-delete extension (see lib/prisma.ts),
    // so a deleted user has to be excluded by hand.
    if (row.user.deletedAt || !mayResetOwnPassword(row.user)) return { ok: false };

    return { ok: true, tokenId: row.id, user: row.user };
}

/**
 * Best-effort throttle on how often one address can be mailed a link.
 *
 * In-memory and therefore per-instance: on serverless it only limits a burst
 * that lands on the same warm instance. That is enough for what it guards
 * against — a form left hammering, or someone trying to flood a permanent's
 * inbox. It is NOT the security boundary; the token itself is (see above).
 */
const MIN_SECONDS_BETWEEN_REQUESTS = 60;
const MAX_TRACKED_ADDRESSES = 500;
const lastRequestAt = new Map<string, number>();

export function throttleResetRequest(email: string): boolean {
    const key = email.trim().toLowerCase();
    const now = Date.now();

    // Drop entries that have aged out; if the map is still oversized (a flood of
    // distinct addresses), clear it wholesale rather than grow without bound.
    for (const [k, at] of lastRequestAt) {
        if (now - at > MIN_SECONDS_BETWEEN_REQUESTS * 1000) lastRequestAt.delete(k);
    }
    if (lastRequestAt.size > MAX_TRACKED_ADDRESSES) lastRequestAt.clear();

    const previous = lastRequestAt.get(key);
    if (previous && now - previous < MIN_SECONDS_BETWEEN_REQUESTS * 1000) return false;

    lastRequestAt.set(key, now);
    return true;
}
