import type { AvailabilityPerson, DayKey } from '@/types';
import { ACTIVE_USER_ACTIVITY_STATUSES } from '@/lib/user-activity-enums';

/**
 * Pure derivations behind /admin/disponibilites: from one flat list of members
 * plus "today", work out who is away when, what needs a permanent's attention,
 * and which lecteurs are free.
 *
 * No prisma import (the DB side lives in lib/users/availabilityData.ts), so the
 * client dashboard derives exactly what the server would have — same rule, one
 * implementation. Everything is day-based: availability is a calendar question,
 * never a timestamp one.
 */

/** How far ahead an indisponibilité starts or ends before it is flagged. */
export const AVAILABILITY_WARNING_DAYS = 21;

/** A lecteur with no attribution for this long reads as dormant, not merely free. */
export const DORMANT_READER_DAYS = 180;

const DAY_MS = 86_400_000;

// Day arithmetic on 'YYYY-MM-DD' keys through UTC, so no local timezone can
// shift a day. (app/admin/stats/stats-utils.ts has the same primitives for the
// stats dashboard; these stay here to keep lib/ free of app/ imports.)
export const addDays = (key: DayKey, days: number): DayKey =>
    new Date(Date.parse(key) + days * DAY_MS).toISOString().slice(0, 10);

/** Whole days from `a` to `b`; negative when `b` is in the past. */
export const daysBetween = (a: DayKey, b: DayKey): number =>
    Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

/** ISO Monday of that day's week. */
export const mondayOf = (key: DayKey): DayKey =>
    addDays(key, -((new Date(key).getUTCDay() + 6) % 7));

export const formatDayKey = (key: DayKey): string =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    });

export const formatDayKeyShort = (key: DayKey): string =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
    });

/** "dans 5 jours" / "aujourd'hui" / "il y a 3 jours" — for warning lines. */
export function describeDelay(days: number): string {
    if (days === 0) return "aujourd'hui";
    if (days === 1) return 'demain';
    if (days === -1) return 'hier';
    if (days > 0) return `dans ${days} jours`;
    return `il y a ${-days} jours`;
}

// ── the indisponibilité window ──────────────────────────────────────────────

export type AbsenceState =
    /** The window is in force today. */
    | 'current'
    /** Booked, hasn't started — the person is still active in the meantime. */
    | 'upcoming'
    /** Over. Normally transient: the sweep turns these back into Actif. */
    | 'elapsed'
    /** Stored indisponible with no end date (legacy import) — needs a decision. */
    | 'openEnded';

export interface Absence {
    person: AvailabilityPerson;
    /** May be null on an open-ended window: "indisponible, sans dates". */
    from: DayKey | null;
    until: DayKey | null;
    state: AbsenceState;
    /** Days until it starts (upcoming) or until it ends (current). */
    daysAway: number | null;
}

const carriesWindow = (p: AvailabilityPerson): boolean =>
    p.activityStatus === 'UNAVAILABLE';

export function absenceState(p: AvailabilityPerson, today: DayKey): AbsenceState {
    if (!p.unavailableUntil && !p.unavailableFrom) return 'openEnded';
    if (p.unavailableFrom && today < p.unavailableFrom) return 'upcoming';
    if (p.unavailableUntil && today > p.unavailableUntil) return 'elapsed';
    if (!p.unavailableUntil) return 'openEnded';
    return 'current';
}

/** Every member currently carrying an indisponibilité, whatever its state. */
export function absences(people: AvailabilityPerson[], today: DayKey): Absence[] {
    return people.filter(carriesWindow).map((person) => {
        const state = absenceState(person, today);
        const daysAway =
            state === 'upcoming' && person.unavailableFrom
                ? daysBetween(today, person.unavailableFrom)
                : state === 'current' && person.unavailableUntil
                    ? daysBetween(today, person.unavailableUntil)
                    : null;
        return {
            person,
            from: person.unavailableFrom,
            until: person.unavailableUntil,
            state,
            daysAway,
        };
    });
}

/** Does an absence show up at all between `start` and `end` (both inclusive)? */
export function overlapsPeriod(absence: Absence, start: DayKey, end: DayKey): boolean {
    // An open end runs forever forward; an open start runs forever backward.
    if (absence.from && absence.from > end) return false;
    if (absence.until && absence.until < start) return false;
    return true;
}

// ── what needs attention ────────────────────────────────────────────────────

export interface AvailabilityAlerts {
    /** Back to Actif within the warning window — plan their next attribution. */
    endingSoon: Absence[];
    /** Leaving within the warning window — don't hand them a long book. */
    startingSoon: Absence[];
    /** Away (or about to be) while still holding attributions. */
    awayWithAttributions: Absence[];
    /** No end date: nothing will ever close it on its own. */
    openEnded: Absence[];
    /** Term already passed but still stored indisponible — the sweep missed it. */
    elapsed: Absence[];
    /** Reads as Actif yet flagged "ne prend pas d'attribution" — contradictory. */
    flaggedUnavailable: AvailabilityPerson[];
}

export function buildAlerts(
    people: AvailabilityPerson[],
    today: DayKey,
    warningDays: number = AVAILABILITY_WARNING_DAYS
): AvailabilityAlerts {
    const all = absences(people, today);
    const horizon = addDays(today, warningDays);

    const endingSoon = all
        .filter((a) => a.state === 'current' && a.until !== null && a.until <= horizon)
        .sort((a, b) => (a.until ?? '').localeCompare(b.until ?? ''));

    const startingSoon = all
        .filter((a) => a.state === 'upcoming' && a.from !== null && a.from <= horizon)
        .sort((a, b) => (a.from ?? '').localeCompare(b.from ?? ''));

    const awayWithAttributions = all
        .filter(
            (a) =>
                a.person.activeAssignments > 0 &&
                (a.state === 'current' || a.state === 'openEnded' || startingSoon.includes(a))
        )
        .sort((a, b) => b.person.activeAssignments - a.person.activeAssignments);

    return {
        endingSoon,
        startingSoon,
        awayWithAttributions,
        openEnded: all.filter((a) => a.state === 'openEnded'),
        elapsed: all.filter((a) => a.state === 'elapsed'),
        flaggedUnavailable: people.filter(
            (p) => isEffectivelyActivePerson(p) && !p.isAvailable
        ),
    };
}

export const alertCount = (alerts: AvailabilityAlerts): number =>
    alerts.endingSoon.length +
    alerts.startingSoon.length +
    alerts.awayWithAttributions.length +
    alerts.openEnded.length +
    alerts.elapsed.length +
    alerts.flaggedUnavailable.length;

// ── lecteurs: who is free, who is saturated ─────────────────────────────────

export const isEffectivelyActivePerson = (p: AvailabilityPerson): boolean =>
    (ACTIVE_USER_ACTIVITY_STATUSES as readonly string[]).includes(p.effectiveStatus);

export const isLecteur = (p: AvailabilityPerson): boolean => p.memberType === 'lecteur';

/** Ready to take a book right now: active, not flagged, under their ceiling. */
export const isTakingAttributions = (p: AvailabilityPerson): boolean =>
    isEffectivelyActivePerson(p) && p.isAvailable;

export interface FreeReader {
    person: AvailabilityPerson;
    /** Days since their last attribution; null when they never had one. */
    idleDays: number | null;
    dormant: boolean;
}

/**
 * Active lecteurs with no attribution in progress — the people a permanent can
 * hand the next demande to. Longest-idle first, "jamais attribué" at the very
 * top: those are the volunteers most likely to have been forgotten.
 */
export function freeReaders(people: AvailabilityPerson[], today: DayKey): FreeReader[] {
    return people
        .filter((p) => isLecteur(p) && isTakingAttributions(p) && p.activeAssignments === 0)
        .map((person) => {
            const idleDays = person.lastAssignedAt
                ? daysBetween(person.lastAssignedAt, today)
                : null;
            return {
                person,
                idleDays,
                dormant: idleDays === null || idleDays >= DORMANT_READER_DAYS,
            };
        })
        .sort((a, b) => {
            if (a.idleDays === null && b.idleDays === null) {
                return a.person.name.localeCompare(b.person.name, 'fr');
            }
            if (a.idleDays === null) return -1;
            if (b.idleDays === null) return 1;
            return b.idleDays - a.idleDays;
        });
}

export interface LoadedReader {
    person: AvailabilityPerson;
    max: number;
    /** At or over their declared ceiling. */
    saturated: boolean;
}

/** Active lecteurs holding attributions, the most loaded first. */
export function loadedReaders(people: AvailabilityPerson[]): LoadedReader[] {
    return people
        .filter((p) => isLecteur(p) && p.activeAssignments > 0)
        .map((person) => {
            const max = person.maxConcurrentAssignments ?? 3;
            return { person, max, saturated: person.activeAssignments >= max };
        })
        .sort(
            (a, b) =>
                b.person.activeAssignments - a.person.activeAssignments ||
                a.person.name.localeCompare(b.person.name, 'fr')
        );
}

// ── coverage over the period ────────────────────────────────────────────────

/**
 * How many of these absences cover each day of [start, end], inclusive —
 * index 0 is `start`, index n is `start + n days`.
 *
 * Deliberately computed from the absences the CALENDAR IS DRAWING rather than
 * from the whole roster: the profile is meant to read as the height of the
 * stack of bars underneath it, which is what makes it need no explaining. A
 * figure computed over a different population than the rows below it is the
 * kind of chart people learn to ignore.
 */
export function absenceProfile(
    list: Absence[],
    start: DayKey,
    end: DayKey
): number[] {
    const days = Math.max(0, daysBetween(start, end));
    const profile = new Array<number>(days + 1).fill(0);

    for (const absence of list) {
        // An open start runs from the beginning of the window, an open end to
        // the end of it — same clamping the bars use.
        const from = absence.from && absence.from > start ? absence.from : start;
        const until = absence.until && absence.until < end ? absence.until : end;
        const first = Math.max(0, daysBetween(start, from));
        const last = Math.min(days, daysBetween(start, until));
        for (let day = first; day <= last; day += 1) profile[day] += 1;
    }
    return profile;
}

/** The lecteur roster split on one given day. */
export interface RosterSnapshot {
    /** Lecteurs not permanently out — the pool being planned. */
    roster: number;
    /** Of those, indisponible on that day. */
    away: number;
    /** Present but flagged « ne prend pas d'attribution ». */
    notTaking: number;
    /** The rest: attribuables that day. */
    available: number;
}

/**
 * The staffing reading behind "1 indisponible, 168 attribuables sur 169".
 *
 * The roster is EVERY lecteur not permanently out — `isAvailable` deliberately
 * does not restrict it. Declaring an indisponibilité clears that flag (the sync
 * guard in /api/user/[id]/activity), so filtering on it made the person vanish
 * from the effectif at the exact moment they should have been counted as away.
 * They are counted here instead, and a flagged-but-present lecteur lands in
 * `notTaking`, which is why away + notTaking + available is always `roster`.
 */
export function rosterSnapshot(people: AvailabilityPerson[], day: DayKey): RosterSnapshot {
    // "Taking attributions" is a today-shaped question; over a future period the
    // roster is everyone not permanently out (radié, décédé, inactif).
    const roster = people.filter(
        (p) =>
            isLecteur(p) &&
            (p.activityStatus === 'ACTIVE' || p.activityStatus === 'UNAVAILABLE')
    );

    const away = roster.filter((p) => {
        if (p.activityStatus !== 'UNAVAILABLE') return false;
        if (p.unavailableFrom && p.unavailableFrom > day) return false;
        if (p.unavailableUntil && p.unavailableUntil < day) return false;
        return true;
    });
    const notTaking = roster.filter((p) => !away.includes(p) && !p.isAvailable).length;

    return {
        roster: roster.length,
        away: away.length,
        notTaking,
        available: roster.length - away.length - notTaking,
    };
}
