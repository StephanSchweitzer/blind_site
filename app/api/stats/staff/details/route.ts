import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import {
    isoUtc,
    parisDayStartUtc,
    parisDayStartUtcPlusDays,
    parseDateParam,
    parseGranularityParam,
    parseMetricParam,
} from '@/lib/stats';
import type { StaffDetailItem, StaffDetailsResponse } from '@/types';

// Lazy detail behind one heatmap cell: the records a person touched during a
// bucket. Only loaded on click, never as part of the aggregate.

const DETAILS_LIMIT = 200;

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;
    const metric = parseMetricParam(params.get('metric'));
    const bucket = parseDateParam(params.get('bucket'));
    const granularity = parseGranularityParam(params.get('granularity'));
    const actorIdRaw = params.get('actorId');
    const actorId = actorIdRaw && /^\d+$/.test(actorIdRaw) ? Number(actorIdRaw) : null;

    if (!metric || !bucket || !granularity || actorId === null) {
        return NextResponse.json({ message: 'Paramètres invalides' }, { status: 400 });
    }

    const from = parisDayStartUtc(bucket);
    const to = parisDayStartUtcPlusDays(bucket, granularity === 'week' ? 7 : 1);

    try {
        let items: StaffDetailItem[];

        if (metric === 'books') {
            const rows = await prisma.$queryRaw<Array<{
                id: number; title: string; author: string; needsReview: boolean; at: string;
            }>>`
                SELECT b.id, b.title, b.author, b."needsReview", ${isoUtc(Prisma.sql`b."createdAt"`)} AS at
                FROM "Book" b
                WHERE b."addedById" = ${actorId}
                  AND b."createdAt" >= ${from} AND b."createdAt" < ${to}
                ORDER BY b."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            items = rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: r.title,
                subtitle: r.author,
                needsReview: r.needsReview,
                href: `/admin/books?search=${encodeURIComponent(r.title)}`,
            }));
        } else if (metric === 'billEvents') {
            // Actor 0 is the "Système" bucket (events without a performer).
            const actorCond = actorId === 0
                ? Prisma.sql`e."performedById" IS NULL`
                : Prisma.sql`e."performedById" = ${actorId}`;
            const rows = await prisma.$queryRaw<Array<{
                id: number; billId: number; type: string; at: string;
                name: string | null; firstName: string | null; lastName: string | null; email: string | null;
            }>>`
                SELECT e.id, e."billId", e.type::text AS type, ${isoUtc(Prisma.sql`e."createdAt"`)} AS at,
                       u.name, u."firstName", u."lastName", u.email
                FROM "BillEvent" e
                JOIN "Bill" bl ON bl.id = e."billId"
                JOIN "User" u ON u.id = bl."clientId"
                WHERE ${actorCond}
                  AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
                ORDER BY e."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            items = rows.map((r) => {
                const clientName = getUserDisplayName(r);
                return {
                    id: r.id,
                    at: r.at,
                    title: `Facture n°${r.billId}`,
                    subtitle: clientName,
                    type: r.type,
                    href: `/admin/bills?search=${encodeURIComponent(clientName)}`,
                };
            });
        } else {
            const rows = await prisma.$queryRaw<Array<{
                id: number; bookTitle: string; at: string;
                name: string | null; firstName: string | null; lastName: string | null; email: string | null;
            }>>`
                SELECT o.id, bk.title AS "bookTitle", ${isoUtc(Prisma.sql`o."createdDate"`)} AS at,
                       u.name, u."firstName", u."lastName", u.email
                FROM "Orders" o
                JOIN "Book" bk ON bk.id = o."catalogueId"
                JOIN "User" u ON u.id = o."aveugleId"
                WHERE o."processedByStaffId" = ${actorId}
                  AND o."createdDate" >= ${from} AND o."createdDate" < ${to}
                ORDER BY o."createdDate" ASC
                LIMIT ${DETAILS_LIMIT}`;
            items = rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: `Demande n°${r.id} — ${r.bookTitle}`,
                subtitle: getUserDisplayName(r),
                href: `/admin/orders?search=${r.id}`,
            }));
        }

        const response: StaffDetailsResponse = { items };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error fetching staff stat details:', error);
        return NextResponse.json({ message: 'Erreur lors du chargement du détail' }, { status: 500 });
    }
});
