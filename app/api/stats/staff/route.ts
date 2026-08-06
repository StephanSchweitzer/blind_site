import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import {
    METRIC_SOURCES,
    bucketExpr,
    isValidRange,
    parisDayStartUtc,
    parseDateParam,
    parseGranularityParam,
    parseMetricParam,
} from '@/lib/stats';
import type { StaffStatsResponse, StaffStatsRow, StatsActor } from '@/types';

// Module A aggregates: one GROUP BY (bucket, actor[, type]) per request.
// The result stays tiny (buckets × staff members); rows are never fetched here.
// What each metric counts lives in METRIC_SOURCES (lib/stats.ts), shared with
// the trend cards and the detail drawer.

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

    const m = METRIC_SOURCES[metric];
    // parseMetricParam only ever returns a metric that carries an actor.
    const actorExpr = m.actorExpr ?? Prisma.sql`0`;

    try {
        const rows = await prisma.$queryRaw<StaffStatsRow[]>`
            SELECT ${bucketExpr(m.dateColumn, granularity)} AS bucket,
                   ${actorExpr}::int AS "actorId",
                   ${m.typeColumn ? Prisma.sql`${m.typeColumn}::text AS type,` : Prisma.empty}
                   COUNT(*)::int AS count
            FROM ${m.table}
            WHERE ${m.dateColumn} >= ${parisDayStartUtc(start)}
              AND ${m.dateColumn} < ${parisDayStartUtc(end)}
              ${m.extraWhere}
            GROUP BY ${m.typeColumn ? Prisma.sql`1, 2, 3` : Prisma.sql`1, 2`}`;

        const actors = await resolveActors([...new Set(rows.map((r) => r.actorId))]);

        const response: StaffStatsResponse = { rows, actors };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating staff stats:', error);
        return NextResponse.json({ message: 'Erreur lors du calcul des statistiques' }, { status: 500 });
    }
});
