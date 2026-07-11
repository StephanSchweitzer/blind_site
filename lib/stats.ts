import { Prisma } from '@prisma/client';
import type { StaffMetric, StatsGranularity } from '@/types';

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

export function parseMetricParam(value: string | null): StaffMetric | null {
    return value === 'books' || value === 'billEvents' || value === 'orders' ? value : null;
}

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
