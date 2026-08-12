import { NextResponse } from 'next/server';
import { UserActivityStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { isEffectivelyActive, parseUnavailabilityWindow, toDayString } from '@/lib/users/activityStatus';
import type { MyUnavailabilityResponse } from '@/types';

/**
 * Declaring your own indisponibilité, from « Mon compte ».
 *
 * The same write as POST /api/user/[id]/activity — one appended
 * UserActivityEvent plus the user's current window — with two restrictions that
 * make it safe to expose to a member about themselves:
 *
 *   1. Only ACTIVE <-> UNAVAILABLE. A member can say "I am away these days" and
 *      take it back; they can never set, or lift, RADIATION / DECEASED /
 *      INACTIVE. Those are decisions the association makes about a person, not
 *      the person about themselves, so anyone currently on one is refused
 *      outright rather than allowed to quietly reactivate their own account.
 *   2. Their own id only. There is no id in the path; it comes from the
 *      session, so no payload can point this at someone else's file.
 *
 * The event records changedById = the member, which is the truth: the trail on
 * /admin/disponibilites and in their fiche then shows who declared what.
 */

/** Statuses a member may move themselves between. */
const SELF_SERVICE_STATUSES = new Set<string>(['ACTIVE', 'UNAVAILABLE']);

const NOT_SELF_SERVICE =
    'Votre statut ne peut être modifié que par un permanent. Contactez le secrétariat aux ECA.';

/**
 * Applies a self-declared status change: appends the history event and moves
 * the user's current window, in one transaction.
 *
 * `isAvailable` follows the same one-directional rule as the admin route:
 * leaving an effectively-active state clears it, coming back never forces it
 * true — that flag also covers "active but not taking work right now" and is
 * not this endpoint's to overwrite.
 */
async function applySelfStatus(
    userId: number,
    toStatus: 'ACTIVE' | 'UNAVAILABLE',
    window: { from: Date; until: Date } | null,
    reason: string,
    comment: string | null
) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activityStatus: true },
    });
    if (!user) return { ok: false as const, status: 404, message: 'Personne introuvable' };
    if (!SELF_SERVICE_STATUSES.has(user.activityStatus)) {
        return { ok: false as const, status: 403, message: NOT_SELF_SERVICE };
    }

    const now = new Date();
    const becomingInactive = !isEffectivelyActive(
        {
            activityStatus: toStatus,
            unavailableFrom: window?.from ?? null,
            unavailableUntil: window?.until ?? null,
        },
        now
    );

    await prisma.$transaction([
        prisma.userActivityEvent.create({
            data: {
                userId,
                fromStatus: user.activityStatus,
                toStatus: toStatus as UserActivityStatus,
                reason,
                comment,
                unavailableFrom: window?.from ?? null,
                unavailableUntil: window?.until ?? null,
                changedById: userId,
                changedAt: now,
            },
        }),
        prisma.user.update({
            where: { id: userId },
            data: {
                activityStatus: toStatus as UserActivityStatus,
                activityChangedAt: now,
                unavailableFrom: window?.from ?? null,
                unavailableUntil: window?.until ?? null,
                ...(becomingInactive ? { isAvailable: false } : {}),
            },
        }),
    ]);

    return { ok: true as const, toStatus, window };
}

const respond = (
    toStatus: string,
    window: { from: Date; until: Date } | null
): MyUnavailabilityResponse => ({
    current: {
        activityStatus: toStatus,
        unavailableFrom: toDayString(window?.from ?? null),
        unavailableUntil: toDayString(window?.until ?? null),
    },
});

/** Declare (or move) one's own indisponibilité. */
export const POST = withAuth(async (request, { me }) => {
    let body: { unavailableFrom?: string; unavailableUntil?: string; comment?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: 'Requête invalide' }, { status: 400 });
    }

    const parsed = parseUnavailabilityWindow(body.unavailableFrom, body.unavailableUntil);
    if (!parsed.ok) {
        return NextResponse.json({ message: parsed.message }, { status: 400 });
    }
    const window = { from: parsed.from, until: parsed.until };

    try {
        const result = await applySelfStatus(
            me.id,
            'UNAVAILABLE',
            window,
            'Indisponibilité déclarée par la personne elle-même',
            body.comment?.trim() || null
        );
        if (!result.ok) {
            return NextResponse.json({ message: result.message }, { status: result.status });
        }
        // A window in force changes who is free on /admin/disponibilites and who
        // the attribution form may offer — revalidate after the write, never before.
        revalidateAdmin();
        return NextResponse.json(respond('UNAVAILABLE', window));
    } catch (error) {
        console.error('Erreur lors de la déclaration d’indisponibilité:', error);
        return NextResponse.json(
            { message: 'Échec de l’enregistrement de votre indisponibilité' },
            { status: 500 }
        );
    }
});

/** Cancel one's own indisponibilité — back to Actif, window cleared. */
export const DELETE = withAuth(async (_request, { me }) => {
    try {
        const result = await applySelfStatus(
            me.id,
            'ACTIVE',
            null,
            'Indisponibilité annulée par la personne elle-même',
            null
        );
        if (!result.ok) {
            return NextResponse.json({ message: result.message }, { status: result.status });
        }
        revalidateAdmin();
        return NextResponse.json(respond('ACTIVE', null));
    } catch (error) {
        console.error('Erreur lors de l’annulation d’indisponibilité:', error);
        return NextResponse.json(
            { message: 'Échec de l’annulation de votre indisponibilité' },
            { status: 500 }
        );
    }
});
