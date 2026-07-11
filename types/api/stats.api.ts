// DTOs for the super-admin stats dashboard (/admin/stats and /api/stats/*).
// Every aggregate stays tiny (buckets × people); row-level data only flows
// through the lazily-loaded detail endpoint.

export type StaffMetric = 'books' | 'billEvents' | 'orders';
export type StatsGranularity = 'day' | 'week';

export interface StatsActor {
    id: number; // 0 = actions without performer ("Système", bill events only)
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

export interface TrendsResponse {
    books: TrendPoint[];
    billEvents: TrendPoint[];
    orders: TrendPoint[];
}

/** One record behind a heatmap cell, normalized across the three metrics. */
export interface StaffDetailItem {
    id: number;
    at: string; // ISO datetime
    title: string;
    subtitle: string | null;
    href: string; // deep link to the matching admin edit screen
    needsReview?: boolean; // books only — "à vérifier"
    type?: string; // BillEventType, bill events only
}

export interface StaffDetailsResponse {
    items: StaffDetailItem[];
}

export interface ReaderStatsReader {
    id: number;
    name: string;
    activityStatus: string;
}

/** One attribution interval on the reader timeline. */
export interface ReaderInterval {
    assignmentId: number;
    readerId: number;
    sentAt: string; // ISO datetime
    returnedAt: string | null; // null = toujours en cours (still out)
    bookTitle: string;
    /** Number of AssignmentReader rows — > 1 means the attribution changed hands. */
    readerChanges: number;
}

export interface ReaderActivityMarker {
    userId: number;
    toStatus: string;
    changedAt: string; // ISO datetime
}

export interface ReaderStatsResponse {
    readers: ReaderStatsReader[];
    intervals: ReaderInterval[];
    activityEvents: ReaderActivityMarker[];
}
