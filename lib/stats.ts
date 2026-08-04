import { Prisma } from '@prisma/client';
import type { MemberGroup, StaffMetric, StatsGranularity, TrendMetric } from '@/types';

// Helpers shared by the /api/stats/* aggregate routes.
//
// Prisma stores DateTime columns as naive UTC timestamps. Staff work "days"
// must be French calendar days, so every bucket/bound converts through
// Europe/Paris rather than truncating raw UTC.

export const STATS_TIMEZONE = 'Europe/Paris';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a 'YYYY-MM-DD' query param; null when absent/malformed. */
export function parseDateParam(value: string | null): string | null {
    if (!value || !DATE_RE.test(value)) return null;
    return Number.isNaN(Date.parse(value)) ? null : value;
}

export function parseGranularityParam(value: string | null): StatsGranularity | null {
    return value === 'day' || value === 'week' ? value : null;
}

/**
 * Where each tracked series comes from.
 *
 * One registry, so the heatmap, the trend cards and the click-through detail can
 * never disagree about what "Demandes traitées" counts.
 */
export interface MetricSource {
    table: Prisma.Sql;
    dateColumn: Prisma.Sql;
    /** Actor column, or null for the org-wide series nobody can be credited with. */
    actorExpr: Prisma.Sql | null;
    /** Rows the metric cannot honestly attribute (legacy imports, missing dates). */
    extraWhere: Prisma.Sql;
    /** Whether to also group by BillEventType. */
    withType: boolean;
}

/** NULL performer → actor 0, rendered as "Système". */
const orSystem = (column: Prisma.Sql) => Prisma.sql`COALESCE(${column}, 0)`;

export const METRIC_SOURCES: Record<TrendMetric, MetricSource> = {
    books: {
        table: Prisma.sql`"Book"`,
        dateColumn: Prisma.sql`"createdAt"`,
        actorExpr: Prisma.sql`"addedById"`,
        extraWhere: Prisma.empty,
        withType: false,
    },
    billEvents: {
        table: Prisma.sql`"BillEvent"`,
        dateColumn: Prisma.sql`"createdAt"`,
        actorExpr: orSystem(Prisma.sql`"performedById"`),
        extraWhere: Prisma.empty,
        withType: true,
    },
    orders: {
        table: Prisma.sql`"Orders"`,
        dateColumn: Prisma.sql`"createdDate"`,
        actorExpr: Prisma.sql`"processedByStaffId"`,
        // Legacy imports have no staff/date — they can't be attributed, exclude them.
        extraWhere: Prisma.sql`AND "processedByStaffId" IS NOT NULL AND "createdDate" IS NOT NULL`,
        withType: false,
    },
    assignments: {
        table: Prisma.sql`"Assignment"`,
        // Attributions have no creation timestamp; the send is the dated act.
        dateColumn: Prisma.sql`"sentToReaderDate"`,
        actorExpr: orSystem(Prisma.sql`"processedByStaffId"`),
        extraWhere: Prisma.sql`AND "sentToReaderDate" IS NOT NULL`,
        withType: false,
    },
    coupsDeCoeur: {
        table: Prisma.sql`"CoupsDeCoeur"`,
        dateColumn: Prisma.sql`"createdAt"`,
        actorExpr: Prisma.sql`"addedById"`,
        extraWhere: Prisma.empty,
        withType: false,
    },
    news: {
        table: Prisma.sql`"News"`,
        dateColumn: Prisma.sql`"publishedAt"`,
        actorExpr: Prisma.sql`"authorId"`,
        extraWhere: Prisma.empty,
        withType: false,
    },
    auditEvents: {
        table: Prisma.sql`"AuditEvent"`,
        dateColumn: Prisma.sql`"createdAt"`,
        actorExpr: orSystem(Prisma.sql`"actorId"`),
        extraWhere: Prisma.empty,
        withType: false,
    },
    payments: {
        table: Prisma.sql`"Payment"`,
        dateColumn: Prisma.sql`"creationDate"`,
        actorExpr: null,
        extraWhere: Prisma.sql`AND "isActive" = true`,
        withType: false,
    },
    bills: {
        table: Prisma.sql`"Bill"`,
        dateColumn: Prisma.sql`"creationDate"`,
        actorExpr: null,
        extraWhere: Prisma.sql`AND "isActive" = true`,
        withType: false,
    },
    newMembers: {
        table: Prisma.sql`"User"`,
        dateColumn: Prisma.sql`"createdAt"`,
        actorExpr: null,
        // Raw SQL bypasses the soft-delete extension, so exclude them here.
        extraWhere: Prisma.sql`AND "deletedAt" IS NULL`,
        withType: false,
    },
    activityEvents: {
        table: Prisma.sql`"UserActivityEvent"`,
        dateColumn: Prisma.sql`"changedAt"`,
        actorExpr: null,
        extraWhere: Prisma.empty,
        withType: false,
    },
};

export const TREND_METRICS = Object.keys(METRIC_SOURCES) as TrendMetric[];

/** The subset that can be broken down per permanent. */
export const STAFF_METRICS = TREND_METRICS.filter(
    (metric) => METRIC_SOURCES[metric].actorExpr !== null
) as StaffMetric[];

export function parseMetricParam(value: string | null): StaffMetric | null {
    return value !== null && (STAFF_METRICS as string[]).includes(value)
        ? (value as StaffMetric)
        : null;
}

/**
 * memberType → the three buckets the Membres filter offers. 'ecouteur' is the
 * retired spelling of auditeur, so it lands with them rather than in "Autres".
 */
export const MEMBER_GROUP_EXPR = Prisma.sql`
    CASE
        WHEN u."memberType" = 'lecteur' THEN 'lecteur'
        WHEN u."memberType" IN ('auditeur', 'ecouteur') THEN 'auditeur'
        ELSE 'autre'
    END`;

export const MEMBER_GROUPS: MemberGroup[] = ['lecteur', 'auditeur', 'autre'];

/** Interpret a naive-UTC timestamp column as a Paris-local timestamp. */
export function parisLocal(column: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${STATS_TIMEZONE})`;
}

/** Paris-local day/week bucket of a naive-UTC column, as 'YYYY-MM-DD' text. */
export function bucketExpr(column: Prisma.Sql, granularity: StatsGranularity): Prisma.Sql {
    return Prisma.sql`to_char(date_trunc(${granularity}, ${parisLocal(column)}), 'YYYY-MM-DD')`;
}

/** Paris-local midnight of a 'YYYY-MM-DD' string, as a naive-UTC timestamp. */
export function parisDayStartUtc(day: string): Prisma.Sql {
    return Prisma.sql`((${day})::timestamp AT TIME ZONE ${STATS_TIMEZONE} AT TIME ZONE 'UTC')`;
}

/** Like parisDayStartUtc, shifted by a whole number of days (DST-safe). */
export function parisDayStartUtcPlusDays(day: string, days: number): Prisma.Sql {
    return Prisma.sql`(((${day})::timestamp + make_interval(days => ${days})) AT TIME ZONE ${STATS_TIMEZONE} AT TIME ZONE 'UTC')`;
}

/** Naive UTC timestamp column rendered as an ISO-8601 UTC string ('…Z'). */
export function isoUtc(column: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

/** Longest range the dashboard may request, to keep aggregates bounded. */
export const MAX_RANGE_DAYS = 400;

/** True when [start, end) is a sane, bounded window. */
export function isValidRange(start: string, end: string): boolean {
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    return days > 0 && days <= MAX_RANGE_DAYS;
}
