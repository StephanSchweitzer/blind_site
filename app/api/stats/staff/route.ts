import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import {
    bucketExpr,
    isValidRange,
    parisDayStartUtc,
    parseDateParam,
    parseGranularityParam,
    parseMetricParam,
} from '@/lib/stats';
import type { StaffMetric, StaffStatsResponse, StaffStatsRow, StatsActor } from '@/types';

// Module A aggregates: one GROUP BY (bucket, actor[, type]) per request.
// The result stays tiny (buckets × staff members); rows are never fetched here.

interface MetricSql {
    table: Prisma.Sql;
    dateColumn: Prisma.Sql;
    /** Actor id expression; bill events coalesce NULL performers to 0 ("Système"). */
    actorExpr: Prisma.Sql;
    /** Extra WHERE conditions (e.g. exclude orders without staff/date). */
    extraWhere: Prisma.Sql;
    /** Whether to also group by BillEventType. */
    withType: boolean;
}

const METRIC_SQL: Record<StaffMetric, MetricSql> = {
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
        actorExpr: Prisma.sql`COALESCE("performedById", 0)`,
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
};

interface RawUserName {
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

/**
 * Resolve actor display names in raw SQL on purpose: the soft-delete query
 * extension hides deleted users from findMany, but historical work must keep
 * naming its author.
 */
async function resolveActors(actorIds: number[]): Promise<StatsActor[]> {
    const realIds = actorIds.filter((id) => id !== 0);
    const users = realIds.length
        ? await prisma.$queryRaw<RawUserName[]>`
            SELECT id, name, "firstName", "lastName", email
            FROM "User"
            WHERE id IN (${Prisma.join(realIds)})`
        : [];
    const actors: StatsActor[] = users.map((u) => ({ id: u.id, name: getUserDisplayName(u) }));
    if (actorIds.includes(0)) actors.push({ id: 0, name: 'Système' });
    return actors;
}

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;
    const metric = parseMetricParam(params.get('metric'));
    const start = parseDateParam(params.get('start'));
    const end = parseDateParam(params.get('end'));
    const granularity = parseGranularityParam(params.get('granularity'));

    if (!metric || !start || !end || !granularity || !isValidRange(start, end)) {
        return NextResponse.json({ message: 'Paramètres invalides' }, { status: 400 });
    }

    const m = METRIC_SQL[metric];

    try {
        const rows = await prisma.$queryRaw<StaffStatsRow[]>`
            SELECT ${bucketExpr(m.dateColumn, granularity)} AS bucket,
                   ${m.actorExpr}::int AS "actorId",
                   ${m.withType ? Prisma.sql`"type"::text AS type,` : Prisma.empty}
                   COUNT(*)::int AS count
            FROM ${m.table}
            WHERE ${m.dateColumn} >= ${parisDayStartUtc(start)}
              AND ${m.dateColumn} < ${parisDayStartUtc(end)}
              ${m.extraWhere}
            GROUP BY ${m.withType ? Prisma.sql`1, 2, 3` : Prisma.sql`1, 2`}`;

        const actors = await resolveActors([...new Set(rows.map((r) => r.actorId))]);

        const response: StaffStatsResponse = { rows, actors };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating staff stats:', error);
        return NextResponse.json({ message: 'Erreur lors du calcul des statistiques' }, { status: 500 });
    }
});
