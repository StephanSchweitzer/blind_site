import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { isValidRange, isoUtc, parisDayStartUtc, parseDateParam } from '@/lib/stats';
import { getUserDisplayName } from '@/lib/users/displayName';
import type { ReaderActivityMarker, ReaderInterval, ReaderStatsResponse } from '@/types';

// Module B: attribution intervals per reader (sentToReaderDate → returnedToECADate),
// including still-out attributions that overlap the window, plus the readers'
// activity-status changes as timeline annotations. Row counts stay bounded by
// the window; overdue detection happens client-side against the threshold.

const INTERVALS_LIMIT = 2000;

interface RawUserRow {
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    activityStatus: string;
}

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
        // Each interval is attributed to the most-recent AssignmentReader; the
        // window count exposes reassignments ("réattribué") without extra queries.
        const intervals = await prisma.$queryRaw<ReaderInterval[]>`
            SELECT a.id AS "assignmentId",
                   ar."readerId",
                   ${isoUtc(Prisma.sql`a."sentToReaderDate"`)} AS "sentAt",
                   CASE WHEN a."returnedToECADate" IS NULL THEN NULL
                        ELSE ${isoUtc(Prisma.sql`a."returnedToECADate"`)} END AS "returnedAt",
                   bk.title AS "bookTitle",
                   ar.changes AS "readerChanges"
            FROM "Assignment" a
            JOIN LATERAL (
                SELECT "readerId", COUNT(*) OVER ()::int AS changes
                FROM "AssignmentReader"
                WHERE "assignmentId" = a.id
                ORDER BY "assignedDate" DESC, id DESC
                LIMIT 1
            ) ar ON true
            JOIN "Book" bk ON bk.id = a."catalogueId"
            WHERE a."sentToReaderDate" IS NOT NULL
              AND a."sentToReaderDate" < ${to}
              AND (a."returnedToECADate" IS NULL OR a."returnedToECADate" >= ${from})
            ORDER BY a."sentToReaderDate" ASC
            LIMIT ${INTERVALS_LIMIT}`;

        const readerIds = [...new Set(intervals.map((i) => i.readerId))];
        if (readerIds.length === 0) {
            const empty: ReaderStatsResponse = { readers: [], intervals: [], activityEvents: [] };
            return NextResponse.json(empty);
        }

        // Raw on purpose: the soft-delete extension hides deleted users from
        // findMany, but historical attributions must keep naming their reader.
        const [users, activityEvents] = await Promise.all([
            prisma.$queryRaw<RawUserRow[]>`
                SELECT id, name, "firstName", "lastName", email, "activityStatus"::text AS "activityStatus"
                FROM "User"
                WHERE id IN (${Prisma.join(readerIds)})`,
            prisma.$queryRaw<ReaderActivityMarker[]>`
                SELECT "userId", "toStatus"::text AS "toStatus",
                       ${isoUtc(Prisma.sql`"changedAt"`)} AS "changedAt"
                FROM "UserActivityEvent"
                WHERE "userId" IN (${Prisma.join(readerIds)})
                  AND "changedAt" >= ${from} AND "changedAt" < ${to}
                ORDER BY "changedAt" ASC`,
        ]);

        const response: ReaderStatsResponse = {
            readers: users.map((u) => ({
                id: u.id,
                name: getUserDisplayName(u),
                activityStatus: u.activityStatus,
            })),
            intervals,
            activityEvents,
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error aggregating reader stats:', error);
        return NextResponse.json({ message: 'Erreur lors du calcul des statistiques lecteurs' }, { status: 500 });
    }
});
