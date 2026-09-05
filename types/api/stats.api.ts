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
    | 'audioEvents'
    | 'auditEvents';

/** Org-wide series with no actor to attribute them to — trend cards only. */
export type OrgMetric = 'payments' | 'bills' | 'newMembers' | 'activityEvents';

export type TrendMetric = StaffMetric | OrgMetric;

export type StatsGranularity = 'day' | 'week';

export interface StatsActor {
    id: number; // 0 = actions without performer ("Système")
    name: string;
}

/** One aggregate cell: (bucket, actor[, sub-type]) → count. */
export interface StaffStatsRow {
    bucket: string; // 'YYYY-MM-DD' (Paris-local day, or ISO-Monday of the week)
    actorId: number;
    count: number;
    /** BillEventType / AudioTrackAction / OrderEventType, per METRIC_SOURCES.typeColumn. */
    type?: string;
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
    /** BillEventType / AudioTrackAction / OrderEventType, per metric. */
    type?: string;
    /** billEvents only — carries e.g. { reason: 'accrual' } for auto-attached orders. */
    payload?: Record<string, unknown> | null;
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

/** One daily bucket of member-side activity, per group. */
export interface MemberSeriesRow {
    bucket: string; // Paris-local day, 'YYYY-MM-DD'
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
    /**
     * The record this label actually names, when it is NOT the audited row
     * itself. A piste audio event is a log line with no screen of its own: it
     * is named by — and opens onto — the book it concerns, which is also the
     * identity worth showing instead of the log row's own meaningless id.
     */
    linked?: { model: string; recordId: string } | null;
}

/** A diff field's before/after, resolved from a foreign-key id to a display name. */
export interface AuditFieldLabelEntry {
    before: string | null;
    after: string | null;
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
     * Names for the foreign-key ids inside `changes` — e.g. `aveugleId`'s
     * 12 → 45 becomes « Jeanne Dupont » → « Marc Petit ». Keyed on the same
     * field names as `changes`; a field absent here (or a side absent within
     * it) had no id to resolve, and the raw value is shown instead.
     */
    fieldLabels?: Record<string, AuditFieldLabelEntry>;
    /**
     * True when this deletion can be replayed: a snapshot is present and none of
     * its values were truncated on the way in. The snapshot itself never leaves
     * the server.
     */
    restorable: boolean;
    /** Why a deletion is not restorable, when it isn't. */
    restoreBlocker: string | null;
    /**
     * Which of the states below this deletion is in — null on anything that is
     * not a DELETE.
     *
     * Carried as a discriminator rather than left for the UI to infer from
     * `restoreBlocker`'s wording: the badge, the tooltip and the detail panel all
     * have to agree, and matching on a French sentence is how they stop agreeing.
     */
    restoreState: AuditRestoreState | null;
    /**
     * For SUPERSEDED: the record this one was folded into, so the journal can
     * offer the fiche that absorbed it instead of a restore that would recreate
     * a hollow duplicate.
     */
    supersededBy?: { model: string; recordId: string } | null;
}

/**
 * Why the « Restaurer » button is, or is not, available on a deletion.
 *
 *   RESTORABLE — a complete snapshot is on file and can be replayed.
 *   INCOMPLETE — a snapshot exists but a value in it was truncated on the way
 *                in. Only reachable for events recorded before snapshots began
 *                keeping their values whole (see lib/audit/diff.ts); refusing is
 *                correct, because restoring would write a size marker into a
 *                real column.
 *   ABSENT     — no snapshot at all: a bulk deletion, or a payload past
 *                MAX_PAYLOAD_CHARS that was dropped rather than mutilated.
 *   SUPERSEDED — the record was folded into another one rather than destroyed
 *                (a book fusion). Its relations now live on the survivor, so a
 *                restore would produce an empty rival fiche; the survivor is
 *                offered instead.
 *   UNTRACKED  — the model has since left AUDITED_MODELS and can no longer be
 *                written back safely.
 */
export type AuditRestoreState =
    | 'RESTORABLE'
    | 'INCOMPLETE'
    | 'ABSENT'
    | 'SUPERSEDED'
    | 'UNTRACKED';

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
