import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import {
    METRIC_SOURCES,
    TREND_METRICS,
    bucketExpr,
    isValidRange,
    parisDayStartUtc,
    parseDateParam,
} from '@/lib/stats';
import type { TrendMetric, TrendPoint, TrendsResponse } from '@/types';

// Org-wide weekly totals, one small sparkline card per tracked series.
// Every series — the ones with an actor and the ones without — comes from the
// same METRIC_SOURCES registry the heatmap uses, so a card and its heatmap can
// never count different things.

function weeklyTotals(metric: TrendMetric, start: string, end: string) {
    const source = METRIC_SOURCES[metric];
    return prisma.$queryRaw<TrendPoint[]>`
        SELECT ${bucketExpr(source.dateColumn, 'week')} AS bucket, COUNT(*)::int AS count
        FROM ${source.table}
        WHERE ${source.dateColumn} >= ${parisDayStartUtc(start)}
          AND ${source.dateColumn} < ${parisDayStartUtc(end)}
          ${source.extraWhere}
        GROUP BY 1
        ORDER BY 1`;
}

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;
    const start = parseDateParam(params.get('start'));
    const end = parseDateParam(params.get('end'));

    if (!start || !end || !isValidRange(start, end)) {
        return NextResponse.json({ message: 'Paramètres invalides' }, { status: 400 });
    }

    try {
        const series = await Promise.all(
            TREND_METRICS.map(async (metric) => [metric, await weeklyTotals(metric, start, end)] as const)
        );

        const response = Object.fromEntries(series) as TrendsResponse;
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating trends:', error);
        return NextResponse.json({ message: 'Erreur lors du calcul des tendances' }, { status: 500 });
    }
});
