import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import {
    MEMBER_GROUP_EXPR,
    bucketExpr,
    isValidRange,
    parisDayStartUtc,
    parseDateParam,
} from '@/lib/stats';
import type {
    MemberGroup,
    MemberRosterRow,
    MemberSeriesRow,
    MemberStatsResponse,
} from '@/types';

// The « Membres » card: who is on the books today, and what moved on the member
// side over the window — inscriptions, changements de statut, paiements — split
// by the Tous / Lecteurs / Auditeurs / Autres filter.
//
// Four small GROUP BYs. Soft-deleted members are excluded everywhere: raw SQL
// does not go through the soft-delete extension, so each query says so itself.

interface RosterRaw {
    group: MemberGroup;
    total: number;
    active: number;
    unavailable: number;
    inactive: number;
}

interface CountRaw {
    bucket: string;
    group: MemberGroup;
    count: number;
}

interface PaymentRaw extends CountRaw {
    amount: string | null;
}

/**
 * Headcount by group and effective status.
 *
 * UNAVAILABLE is read the way the rest of the app reads it (isWindowInForce in
 * lib/users/activityStatus.ts): a window that hasn't opened yet, or that has
 * already run its term, counts as active — nothing rewrites those rows on a
 * schedule.
 *
 * The comparison is on the FRENCH CALENDAR DAY, both ends inclusive, not on the
 * instant: the bounds are stored as UTC-midnight days, so comparing them to
 * now() would read a window ending today as already elapsed.
 */
const PARIS_TODAY = Prisma.sql`date_trunc('day', (now() AT TIME ZONE 'Europe/Paris'))`;

const WINDOW_IN_FORCE = Prisma.sql`
    (u."unavailableFrom" IS NULL OR u."unavailableFrom" <= ${PARIS_TODAY})
    AND (u."unavailableUntil" IS NULL OR u."unavailableUntil" >= ${PARIS_TODAY})`;

const EFFECTIVE_UNAVAILABLE = Prisma.sql`
    u."activityStatus" = 'UNAVAILABLE' AND (${WINDOW_IN_FORCE})`;

/** ACTIVE, plus the UNAVAILABLE rows whose window is still ahead or already over. */
const EFFECTIVE_ACTIVE = Prisma.sql`
    u."activityStatus" = 'ACTIVE'
    OR (u."activityStatus" = 'UNAVAILABLE' AND NOT (${WINDOW_IN_FORCE}))`;

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;
    const start = parseDateParam(params.get('start'));
    const end = parseDateParam(params.get('end'));

    if (!start || !end || !isValidRange(start, end)) {
        return NextResponse.json({ message: 'Paramètres invalides' }, { status: 400 });
    }

    const from = parisDayStartUtc(start);
    const to = parisDayStartUtc(end);

    try {
        const [roster, inscriptions, statusChanges, payments] = await Promise.all([
            prisma.$queryRaw<RosterRaw[]>`
                SELECT ${MEMBER_GROUP_EXPR} AS "group",
                       COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE ${EFFECTIVE_ACTIVE})::int AS active,
                       COUNT(*) FILTER (WHERE ${EFFECTIVE_UNAVAILABLE})::int AS unavailable,
                       COUNT(*) FILTER (
                           WHERE u."activityStatus" IN ('RADIATION', 'DECEASED', 'INACTIVE')
                       )::int AS inactive
                FROM "User" u
                WHERE u."deletedAt" IS NULL
                GROUP BY 1`,

            prisma.$queryRaw<CountRaw[]>`
                SELECT ${bucketExpr(Prisma.sql`u."createdAt"`, 'day')} AS bucket,
                       ${MEMBER_GROUP_EXPR} AS "group",
                       COUNT(*)::int AS count
                FROM "User" u
                WHERE u."deletedAt" IS NULL
                  AND u."createdAt" >= ${from} AND u."createdAt" < ${to}
                GROUP BY 1, 2`,

            prisma.$queryRaw<CountRaw[]>`
                SELECT ${bucketExpr(Prisma.sql`e."changedAt"`, 'day')} AS bucket,
                       ${MEMBER_GROUP_EXPR} AS "group",
                       COUNT(*)::int AS count
                FROM "UserActivityEvent" e
                JOIN "User" u ON u.id = e."userId"
                WHERE u."deletedAt" IS NULL
                  AND e."changedAt" >= ${from} AND e."changedAt" < ${to}
                GROUP BY 1, 2`,

            // Payments without a client can't be attributed to a group; they
            // land in "Autres" so the totals still add up to what was cashed in.
            prisma.$queryRaw<PaymentRaw[]>`
                SELECT ${bucketExpr(Prisma.sql`p."creationDate"`, 'day')} AS bucket,
                       COALESCE(${MEMBER_GROUP_EXPR}, 'autre') AS "group",
                       COUNT(*)::int AS count,
                       SUM(p.amount)::text AS amount
                FROM "Payment" p
                LEFT JOIN "User" u ON u.id = p."clientId" AND u."deletedAt" IS NULL
                WHERE p."isActive" = true
                  AND p."creationDate" >= ${from} AND p."creationDate" < ${to}
                GROUP BY 1, 2`,
        ]);

        // Fold the three series into one row per (bucket, group).
        const byKey = new Map<string, MemberSeriesRow>();
        const rowFor = (bucket: string, group: MemberGroup): MemberSeriesRow => {
            const key = `${bucket}|${group}`;
            let row = byKey.get(key);
            if (!row) {
                row = { bucket, group, newMembers: 0, statusChanges: 0, payments: 0, paymentAmount: 0 };
                byKey.set(key, row);
            }
            return row;
        };

        for (const r of inscriptions) rowFor(r.bucket, r.group).newMembers = r.count;
        for (const r of statusChanges) rowFor(r.bucket, r.group).statusChanges = r.count;
        for (const r of payments) {
            const row = rowFor(r.bucket, r.group);
            row.payments = r.count;
            row.paymentAmount = Number(r.amount ?? 0);
        }

        const response: MemberStatsResponse = {
            roster,
            series: [...byKey.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating member stats:', error);
        return NextResponse.json(
            { message: 'Erreur lors du calcul des statistiques membres' },
            { status: 500 }
        );
    }
});
