import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { bucketExpr, isValidRange, parisDayStartUtc, parseDateParam } from '@/lib/stats';
import type { TrendPoint, TrendsResponse } from '@/types';

// Org-wide weekly totals for the trend cards above the heatmap.
// Three tiny GROUP BY aggregates, one per metric.

function weeklyTotals(table: Prisma.Sql, dateColumn: Prisma.Sql, start: string, end: string) {
    return prisma.$queryRaw<TrendPoint[]>`
        SELECT ${bucketExpr(dateColumn, 'week')} AS bucket, COUNT(*)::int AS count
        FROM ${table}
        WHERE ${dateColumn} >= ${parisDayStartUtc(start)}
          AND ${dateColumn} < ${parisDayStartUtc(end)}
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
        const [books, billEvents, orders] = await Promise.all([
            weeklyTotals(Prisma.sql`"Book"`, Prisma.sql`"createdAt"`, start, end),
            weeklyTotals(Prisma.sql`"BillEvent"`, Prisma.sql`"createdAt"`, start, end),
            weeklyTotals(Prisma.sql`"Orders"`, Prisma.sql`"createdDate"`, start, end),
        ]);

        const response: TrendsResponse = { books, billEvents, orders };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating trends:', error);
        return NextResponse.json({ message: 'Erreur lors du calcul des tendances' }, { status: 500 });
    }
});
