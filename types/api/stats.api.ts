// DTOs for the super-admin stats dashboard (/admin/stats and /api/stats/*).
// Every aggregate stays tiny (buckets × people); row-level data only flows
// through the lazily-loaded detail endpoint and the paginated audit timeline.

/** Metrics that carry an actor, so they can be broken down per permanent. */
export type StaffMetric =
    | 'books'
    | 'billEvents'
    | 'orders'
    | 'assignments'
    | 'coupsDeCoeur'
    | 'news'
    | 'auditEvents';

/** Org-wide series with no actor to attribute them to — trend cards only. */
export type OrgMetric = 'payments' | 'bills' | 'newMembers' | 'activityEvents';

export type TrendMetric = StaffMetric | OrgMetric;

export type StatsGranularity = 'day' | 'week';

export interface StatsActor {
    id: number; // 0 = actions without performer ("Système")
    name: string;
}

/** One aggregate cell: (bucket, actor[, bill-event type]) → count. */
export interface StaffStatsRow {
    bucket: string; // 'YYYY-MM-DD' (Paris-local day, or ISO-Monday of the week)
    actorId: number;
    count: number;
    type?: string; // BillEventType, only for metric=billEvents
}

export interface StaffStatsResponse {
    rows: StaffStatsRow[];
    actors: StatsActor[];
}

export interface TrendPoint {
    bucket: string; // ISO Monday of the week, 'YYYY-MM-DD'
    count: number;
}

export type TrendsResponse = Record<TrendMetric, TrendPoint[]>;

/** One record behind a heatmap cell, normalized across the metrics. */
export interface StaffDetailItem {
    id: number;
    at: string; // ISO datetime
    title: string;
    subtitle: string | null;
    href: string | null; // deep link to the matching admin screen
    needsReview?: boolean; // books only — "à vérifier"
    type?: string; // BillEventType, bill events only
}

export interface StaffDetailsResponse {
    items: StaffDetailItem[];
}

// ── Membres ─────────────────────────────────────────────────────────────────

/** The three buckets behind the Tous / Lecteurs / Auditeurs / Autres filter. */
export type MemberGroup = 'lecteur' | 'auditeur' | 'autre';

/** Headcount per group, as it stands today (not over the window). */
export interface MemberRosterRow {
    group: MemberGroup;
    total: number;
    active: number;
    unavailable: number;
    /** RADIATION / DECEASED / legacy INACTIVE. */
    inactive: number;
}

/** One weekly bucket of member-side activity, per group. */
export interface MemberSeriesRow {
    bucket: string; // ISO Monday, 'YYYY-MM-DD'
    group: MemberGroup;
    newMembers: number;
    statusChanges: number;
    payments: number;
    /** Sum of Payment.amount, in euros. */
    paymentAmount: number;
}

export interface MemberStatsResponse {
    roster: MemberRosterRow[];
    series: MemberSeriesRow[];
}

// ── Journal des modifications (audit trail) ─────────────────────────────────

export type AuditOperation = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export type AuditFieldValue = string | number | boolean | null;

/** `{ champ: [avant, après] }` — never a pair of full snapshots. */
export type AuditChangeMap = Record<string, [AuditFieldValue, AuditFieldValue]>;

/**
 * What a traced record IS, so a journal line can be read without opening it:
 * « Livre n°4549 » becomes « Le Ventre de Paris » / « Émile Zola ».
 */
export interface AuditRecordLabel {
    /** The record's own name: a title, a person, an amount. */
    title: string;
    /** Disambiguator, shown muted beside it: the author, the client, the auditeur. */
    subtitle: string | null;
}

export interface AuditEventItem {
    id: number;
    at: string; // ISO datetime
    model: string;
    recordId: string;
    operation: AuditOperation;
    actorId: number | null;
    /** Display name, falling back to the denormalized e-mail, then "Système". */
    actorName: string;
    /**
     * Resolved from the record itself, or from the snapshot when it has been
     * deleted. Null when the model has no name to give (bulk events, join rows,
     * a record deleted without a usable snapshot) — the id alone is then shown.
     */
    recordLabel: AuditRecordLabel | null;
    changes: AuditChangeMap;
    /**
     * True when this deletion can be replayed: a snapshot is present and none of
     * its values were truncated on the way in. The snapshot itself never leaves
     * the server.
     */
    restorable: boolean;
    /** Why a deletion is not restorable, when it isn't. */
    restoreBlocker: string | null;
}

/** State of the trail itself, surfaced so an empty page never looks broken. */
export interface AuditRetentionInfo {
    retentionDays: number;
    megabytes: number;
    rows: number;
    /** True when the table passed its soft limit and the window auto-shortened. */
    underPressure: boolean;
    softLimitMb: number;
}

export interface AuditEventsResponse {
    events: AuditEventItem[];
    /** Models present in the window, for the filter — never the whole registry. */
    models: string[];
    actors: StatsActor[];
    retention: AuditRetentionInfo;
    /** id to pass back as `before` for the next page; null when exhausted. */
    nextCursor: number | null;
}

export interface AuditRestoreResponse {
    success: boolean;
    message: string;
}
