import { prisma } from '@/lib/prisma';
import { getUserActivityStatusLabel } from '@/lib/user-activity-enums';
import {
    describeUnavailability,
    isEffectivelyActive,
    resolveEffectiveActivityStatus,
} from '@/lib/users/activityStatus';
import type { UserActivityStatus } from '@prisma/client';

/**
 * Structured info about why a person is blocked, surfaced to the admin UI so
 * it can render the reactivation dialog without a second round-trip.
 */
export interface BlockedActivityInfo {
    userId: number;
    name: string;
    /** EFFECTIVE status - what the person reads as today, dates applied. */
    activityStatus: UserActivityStatus;
    statusLabel: string;
    /** "jusqu'au 15/08/2026" when an unavailability window is in force. */
    statusDetail: string | null;
    reason: string | null;
    comment: string | null;
    changedAt: string | null;
}

export type ActivityGuardResult =
    | { ok: true }
    | { ok: false; httpStatus: number; message: string; blocked: BlockedActivityInfo };

type NameParts = {
    name: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    civility?: { name: string } | null;
};

/** "Civilité Prénom Nom", falling back to name/email — same convention used app-wide. */
export function composeUserDisplayName(u: NameParts): string {
    const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    const composed = [u.civility?.name, full].filter(Boolean).join(' ').trim();
    return composed || u.name || u.email || 'Personne sans nom';
}

const userActivitySelect = {
    id: true,
    name: true,
    email: true,
    firstName: true,
    lastName: true,
    activityStatus: true,
    activityChangedAt: true,
    unavailableFrom: true,
    unavailableUntil: true,
    civility: { select: { name: true } },
} as const;

/**
 * Loads a user's current activity status plus their most recent
 * UserActivityEvent (for the reason/comment shown to admins). Returns null
 * if the user doesn't exist.
 */
export async function getUserActivitySnapshot(userId: number) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userActivitySelect,
    });
    if (!user) return null;

    const latestEvent = await prisma.userActivityEvent.findFirst({
        where: { userId },
        orderBy: { changedAt: 'desc' },
        select: { reason: true, comment: true, changedAt: true },
    });

    return { user, latestEvent };
}

/**
 * Guard used before linking a person to a new order (as auditeur/aveugle) or
 * a new assignment (as lecteur): they must currently READ as ACTIVE — which
 * for an unavailability means the window is not in force today. Returns a
 * structured `blocked` payload on failure so the API can answer 409 with
 * enough detail for the admin UI to offer reactivation right there, instead
 * of sending the admin to the user's profile.
 */
export async function guardUserIsActive(
    userId: number,
    role: 'aveugle' | 'lecteur'
): Promise<ActivityGuardResult> {
    const snapshot = await getUserActivitySnapshot(userId);

    if (!snapshot) {
        return {
            ok: false,
            httpStatus: 404,
            message: 'Personne introuvable.',
            blocked: {
                userId,
                name: 'Personne introuvable',
                activityStatus: 'INACTIVE' as UserActivityStatus,
                statusLabel: 'Inconnu',
                statusDetail: null,
                reason: null,
                comment: null,
                changedAt: null,
            },
        };
    }

    const { user, latestEvent } = snapshot;

    if (isEffectivelyActive(user)) {
        return { ok: true };
    }

    const effectiveStatus = resolveEffectiveActivityStatus(user) as UserActivityStatus;
    const name = composeUserDisplayName(user);
    const statusLabel = getUserActivityStatusLabel(effectiveStatus);
    const statusDetail = describeUnavailability(user);
    const reason = latestEvent?.reason ?? null;
    const action = role === 'aveugle' ? 'lui attribuer une demande' : 'lui assigner une attribution';

    const blocked: BlockedActivityInfo = {
        userId: user.id,
        name,
        activityStatus: effectiveStatus,
        statusLabel,
        statusDetail,
        reason,
        comment: latestEvent?.comment ?? null,
        changedAt: (latestEvent?.changedAt ?? user.activityChangedAt)?.toISOString() ?? null,
    };

    return {
        ok: false,
        httpStatus: 409,
        message:
            `${name} est ${statusLabel.toLowerCase()}${statusDetail ? ` ${statusDetail}` : ''}` +
            `${reason ? ` (${reason})` : ''}. ` +
            `Pour continuer, vous devez réactiver cette personne avant de ${action}.`,
        blocked,
    };
}
