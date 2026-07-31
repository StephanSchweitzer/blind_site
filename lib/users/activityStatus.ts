import type { Prisma } from '@prisma/client';
import {
    ACTIVE_USER_ACTIVITY_STATUSES,
    USER_ACTIVITY_STATUS_VALUES,
    getUserActivityStatusLabel,
    isDatedActivityStatus,
    type UserActivityStatus,
} from '@/lib/user-activity-enums';

/**
 * Effective activity status - computed at READ TIME, never stored.
 *
 * UNAVAILABLE carries a window (unavailableFrom -> unavailableUntil, both ends
 * inclusive). The stored status stays UNAVAILABLE for the whole life of that
 * window; what changes on its own is how it READS:
 *
 *   - window not started yet -> effectively ACTIVE (a permanent can plan an
 *     absence weeks ahead without the person dropping out of the lists today)
 *   - window in force        -> UNAVAILABLE
 *   - window elapsed         -> effectively ACTIVE again
 *
 * So there is no cron, no scheduled job, and no row ever rewritten when a
 * window opens or closes. Every read path - list filters, badges, the
 * attribution guard - resolves the effective status through this module.
 *
 * Status answers exactly one question: CAN THIS PERSON RECEIVE NEW
 * ATTRIBUTIONS? It is not a statement about whether they are currently
 * recording; `isAvailable` / availabilityNotes cover that.
 *
 * This file is pure (no prisma import, type-only Prisma types) so client
 * components can resolve the same status the server did.
 */

/** The stored fields any effective-status computation needs. */
export interface ActivityStatusFields {
    activityStatus: string;
    unavailableFrom?: Date | string | null;
    unavailableUntil?: Date | string | null;
}

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today as a UTC-midnight Date, on the FRENCH calendar - the same day boundary
 * the rest of the app uses (lib/stats.ts). Server and browser therefore agree
 * even between midnight and 02:00 Paris time, when the UTC date still lags.
 */
export function parisDayStart(now: Date = new Date()): Date {
    return new Date(`${PARIS_DAY.format(now)}T00:00:00.000Z`);
}

/** 'YYYY-MM-DD' (or a Date) to its UTC-midnight Date; null when absent/invalid. */
export function toDayStart(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    if (typeof value === 'string') {
        const day = value.slice(0, 10);
        if (!DAY_RE.test(day)) return null;
        const parsed = new Date(`${day}T00:00:00.000Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** A stored day as 'YYYY-MM-DD', for date inputs and JSON payloads. */
export function toDayString(value: Date | string | null | undefined): string | null {
    const day = toDayStart(value);
    return day ? day.toISOString().slice(0, 10) : null;
}

/** A stored day as 'JJ/MM/AAAA'. */
export function formatDay(value: Date | string | null | undefined): string | null {
    const day = toDayStart(value);
    if (!day) return null;
    return day.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/** Is the unavailability window in force on `now`? Both ends inclusive. */
export function isWindowInForce(user: ActivityStatusFields, now?: Date): boolean {
    const today = parisDayStart(now);
    const from = toDayStart(user.unavailableFrom);
    const until = toDayStart(user.unavailableUntil);
    // A missing bound means "open on that side": rows imported without dates
    // read as unavailable until someone gives them a window.
    if (from && today < from) return false;
    if (until && today > until) return false;
    return true;
}

/** The status to display and to decide on, dates taken into account. */
export function resolveEffectiveActivityStatus(user: ActivityStatusFields, now?: Date): string {
    if (!isDatedActivityStatus(user.activityStatus)) return user.activityStatus;
    return isWindowInForce(user, now) ? user.activityStatus : 'ACTIVE';
}

/** Can this person be given new attributions right now? */
export function isEffectivelyActive(user: ActivityStatusFields, now?: Date): boolean {
    return (ACTIVE_USER_ACTIVITY_STATUSES as readonly string[]).includes(
        resolveEffectiveActivityStatus(user, now)
    );
}

/**
 * The window, worded for display next to the badge - the optional end-date
 * line. Null when the person carries no window at all.
 *
 *   in force        -> "jusqu'au 15/08/2026"
 *   not started yet -> "indisponible du 01/09/2026 au 15/09/2026"
 *   elapsed         -> null (nothing left to say: they read as Actif)
 */
export function describeUnavailability(user: ActivityStatusFields, now?: Date): string | null {
    if (!isDatedActivityStatus(user.activityStatus)) return null;

    const from = formatDay(user.unavailableFrom);
    const until = formatDay(user.unavailableUntil);

    if (isWindowInForce(user, now)) {
        if (until) return `jusqu'au ${until}`;
        return from ? `depuis le ${from}` : null;
    }

    // Not in force: either the window is still ahead, or it has elapsed.
    const today = parisDayStart(now);
    const start = toDayStart(user.unavailableFrom);
    if (start && today < start) {
        const label = getUserActivityStatusLabel(user.activityStatus).toLowerCase();
        return until ? `${label} du ${from} au ${until}` : `${label} à partir du ${from}`;
    }
    return null;
}

/**
 * Validates the window submitted with an UNAVAILABLE change. Both dates are
 * required (the status is temporary by definition), the start may be in the
 * future, and the end may not precede the start.
 */
export function parseUnavailabilityWindow(
    rawFrom: unknown,
    rawUntil: unknown
): { ok: true; from: Date; until: Date } | { ok: false; message: string } {
    const from = typeof rawFrom === 'string' ? toDayStart(rawFrom) : null;
    const until = typeof rawUntil === 'string' ? toDayStart(rawUntil) : null;

    if (!from || !until) {
        return {
            ok: false,
            message: 'Une indisponibilité demande une date de début et une date de fin.',
        };
    }
    if (until < from) {
        return {
            ok: false,
            message: 'La date de fin doit être postérieure à la date de début.',
        };
    }
    return { ok: true, from, until };
}

/**
 * Prisma `where` fragments mirroring resolveEffectiveActivityStatus, so the
 * paginated list and its counts filter on the effective status too. Kept next
 * to the resolver on purpose: the two must always say the same thing.
 */
export function effectivelyActiveWhere(now?: Date): Prisma.UserWhereInput {
    const today = parisDayStart(now);
    return {
        OR: [
            { activityStatus: 'ACTIVE' },
            // Stored UNAVAILABLE, but the window is either still ahead or over.
            {
                activityStatus: 'UNAVAILABLE',
                OR: [{ unavailableFrom: { gt: today } }, { unavailableUntil: { lt: today } }],
            },
        ],
    };
}

/** Stored UNAVAILABLE with the window actually in force today. */
export function unavailableNowWhere(now?: Date): Prisma.UserWhereInput {
    const today = parisDayStart(now);
    return {
        activityStatus: 'UNAVAILABLE',
        AND: [
            { OR: [{ unavailableFrom: null }, { unavailableFrom: { lte: today } }] },
            { OR: [{ unavailableUntil: null }, { unavailableUntil: { gte: today } }] },
        ],
    };
}

/**
 * `where` for one value of the list's status filter: 'active', 'inactive'
 * (= everything but active), or one specific status - including the legacy
 * ones, so a permanent can still list the people left on them. Null when the
 * filter is 'all' or unrecognised.
 */
export function activityStatusFilterWhere(
    filter: string,
    now?: Date
): Prisma.UserWhereInput | null {
    if (filter === 'active' || filter === 'ACTIVE') return effectivelyActiveWhere(now);
    if (filter === 'inactive') return { NOT: effectivelyActiveWhere(now) };
    if (filter === 'UNAVAILABLE') return unavailableNowWhere(now);
    if ((USER_ACTIVITY_STATUS_VALUES as readonly string[]).includes(filter)) {
        return { activityStatus: filter as UserActivityStatus };
    }
    return null;
}
