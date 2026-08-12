import type { AuditChangeMap, AuditOperation, AuditRecordLabel } from './stats.api';

// ============================================================================
// « Mon compte » — what the signed-in person may see and change about themselves
//
// Deliberately NOT the same shapes as the stats dashboard's. Everything here is
// self-scoped: no actor field (it is always you), no restore affordance (the
// page is read-only on the trail), no facets (there is nothing to filter by
// when the author is fixed). Keeping the types separate is what makes it
// obvious at a glance that this surface can't widen into someone else's data.
// ============================================================================

/** One line of « Mon activité récente ». */
export interface MyActivityItem {
    id: number;
    /** ISO datetime, UTC. */
    at: string;
    model: string;
    recordId: string;
    operation: AuditOperation;
    /** What the touched record IS, so the line reads without opening it. */
    recordLabel: AuditRecordLabel | null;
    changes: AuditChangeMap;
}

export interface MyActivityResponse {
    events: MyActivityItem[];
    /**
     * How many days the trail keeps. Shown to the reader: an empty timeline
     * means "you changed nothing this fortnight", never "the log is broken".
     */
    retentionDays: number;
    /** id to pass back as `before` for the next page; null when exhausted. */
    nextCursor: number | null;
}

/** The window as the account page reads and writes it, days as 'YYYY-MM-DD'. */
export interface MyUnavailability {
    activityStatus: string;
    unavailableFrom: string | null;
    unavailableUntil: string | null;
}

export interface MyUnavailabilityResponse {
    current: MyUnavailability;
}
