// DTOs for the disponibilités screen (/admin/disponibilites and /api/availability).
//
// One flat `people` array carries everything the screen needs; the timeline,
// the alerts and the tables are all derived from it client-side by the pure
// helpers in lib/users/availability.ts. Payload stays small because the query
// only returns members who are relevant to availability: anyone carrying an
// indisponibilité, plus every lecteur.

/** Days as 'YYYY-MM-DD' throughout — never datetimes, availability is per-day. */
export type DayKey = string;

export interface AvailabilityPerson {
    id: number;
    name: string;
    email: string | null;
    memberType: string;
    accessLevel: string;
    /** Status as STORED on the row. */
    activityStatus: string;
    /** Status as it READS today, window applied (lib/users/activityStatus.ts). */
    effectiveStatus: string;
    unavailableFrom: DayKey | null;
    unavailableUntil: DayKey | null;
    /**
     * "Ne prend pas d'attribution en ce moment" — a standing flag on the
     * profile, unrelated to the activity status. A member can perfectly well be
     * Actif and still be flagged unavailable; the screen surfaces the mismatch.
     */
    isAvailable: boolean;
    availabilityNotes: string | null;
    /** Attributions currently open with this person as their latest reader. */
    activeAssignments: number;
    maxConcurrentAssignments: number | null;
    /** Day of the most recent attribution ever handed to them, if any. */
    lastAssignedAt: DayKey | null;
    specialization: string | null;
    languages: string[];
}

export interface AvailabilityResponse {
    /** The French calendar day the effective statuses were resolved against. */
    today: DayKey;
    /** How far ahead an indisponibilité is flagged as "bientôt". */
    warningDays: number;
    people: AvailabilityPerson[];
    /**
     * Indisponibilités whose term had elapsed and that this very request closed
     * (see lib/users/expireUnavailability.ts), so the screen can report it.
     */
    justClosed: number;
}

// ── one person's detail, behind /api/availability/[id] ──────────────────────
//
// What the disponibilités screen opens instead of sending a permanent off to
// the dossier: everything needed to READ a person's situation (their charge,
// their history) and to CHANGE it (status, window, "prend des attributions",
// plafond) without leaving the planning view.

/** One attribution this person is (or was) the latest reader on. */
export interface AvailabilityAssignment {
    id: number;
    orderId: number | null;
    bookTitle: string;
    bookAuthor: string | null;
    statusId: number;
    statusName: string;
    /** Not Terminé/Soldé — this is what counts against their plafond. */
    open: boolean;
    /** Day the book was handed to them. */
    assignedDate: DayKey | null;
    sentToReaderDate: DayKey | null;
    returnedToECADate: DayKey | null;
}

/** One entry of the append-only UserActivityEvent log, flattened for display. */
export interface AvailabilityActivityEvent {
    id: number;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    comment: string | null;
    unavailableFrom: DayKey | null;
    unavailableUntil: DayKey | null;
    /** ISO timestamp — this one is an instant, not a calendar day. */
    changedAt: string;
    /** Display name of the permanent who made the change; null = « Système ». */
    changedBy: string | null;
}

export interface PersonAvailabilityDetail {
    today: DayKey;
    person: AvailabilityPerson;
    /** Open attributions first, then the most recent closed ones. */
    assignments: AvailabilityAssignment[];
    /** How many of `assignments` are still open (== person.activeAssignments). */
    openAssignments: number;
    /** Most recent status changes, newest first. */
    events: AvailabilityActivityEvent[];
}
