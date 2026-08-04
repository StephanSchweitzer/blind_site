import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import { OPERATION_LABELS, modelLabel, recordHref } from '@/lib/audit/labels';
import {
    isoUtc,
    parisDayStartUtc,
    parisDayStartUtcPlusDays,
    parseDateParam,
    parseGranularityParam,
    parseMetricParam,
} from '@/lib/stats';
import type { AuditOperation, StaffDetailItem, StaffDetailsResponse, StaffMetric } from '@/types';

// Lazy detail behind one heatmap cell: the records a person touched during a
// bucket. Only loaded on click, never as part of the aggregate.

const DETAILS_LIMIT = 200;

/** Actor 0 is the "Système" bucket — rows recorded without a performer. */
const actorCondition = (column: Prisma.Sql, actorId: number): Prisma.Sql =>
    actorId === 0 ? Prisma.sql`${column} IS NULL` : Prisma.sql`${column} = ${actorId}`;

interface NameParts {
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

async function loadItems(
    metric: StaffMetric,
    actorId: number,
    from: Prisma.Sql,
    to: Prisma.Sql
): Promise<StaffDetailItem[]> {
    switch (metric) {
        case 'books': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; title: string; author: string; needsReview: boolean; at: string;
            }>>`
                SELECT b.id, b.title, b.author, b."needsReview", ${isoUtc(Prisma.sql`b."createdAt"`)} AS at
                FROM "Book" b
                WHERE b."addedById" = ${actorId}
                  AND b."createdAt" >= ${from} AND b."createdAt" < ${to}
                ORDER BY b."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: r.title,
                subtitle: r.author,
                needsReview: r.needsReview,
                href: `/admin/books?book=${r.id}`,
            }));
        }

        case 'billEvents': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; billId: number; type: string; at: string;
            } & NameParts>>`
                SELECT e.id, e."billId", e.type::text AS type, ${isoUtc(Prisma.sql`e."createdAt"`)} AS at,
                       u.name, u."firstName", u."lastName", u.email
                FROM "BillEvent" e
                JOIN "Bill" bl ON bl.id = e."billId"
                JOIN "User" u ON u.id = bl."clientId"
                WHERE ${actorCondition(Prisma.sql`e."performedById"`, actorId)}
                  AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
                ORDER BY e."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: `Facture n°${r.billId}`,
                subtitle: getUserDisplayName(r),
                type: r.type,
                href: `/admin/bills?bill=${r.billId}`,
            }));
        }

        case 'orders': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; bookTitle: string; at: string;
            } & NameParts>>`
                SELECT o.id, bk.title AS "bookTitle", ${isoUtc(Prisma.sql`o."createdDate"`)} AS at,
                       u.name, u."firstName", u."lastName", u.email
                FROM "Orders" o
                JOIN "Book" bk ON bk.id = o."catalogueId"
                JOIN "User" u ON u.id = o."aveugleId"
                WHERE o."processedByStaffId" = ${actorId}
                  AND o."createdDate" >= ${from} AND o."createdDate" < ${to}
                ORDER BY o."createdDate" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: `Demande n°${r.id} — ${r.bookTitle}`,
                subtitle: getUserDisplayName(r),
                href: `/admin/orders?order=${r.id}`,
            }));
        }

        case 'assignments': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; bookTitle: string; at: string; statusName: string;
            }>>`
                SELECT a.id, bk.title AS "bookTitle", s.name AS "statusName",
                       ${isoUtc(Prisma.sql`a."sentToReaderDate"`)} AS at
                FROM "Assignment" a
                JOIN "Book" bk ON bk.id = a."catalogueId"
                JOIN "Status" s ON s.id = a."statusId"
                WHERE ${actorCondition(Prisma.sql`a."processedByStaffId"`, actorId)}
                  AND a."sentToReaderDate" >= ${from} AND a."sentToReaderDate" < ${to}
                ORDER BY a."sentToReaderDate" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: `Attribution n°${r.id} — ${r.bookTitle}`,
                subtitle: r.statusName,
                href: `/admin/assignments?assignment=${r.id}`,
            }));
        }

        case 'coupsDeCoeur': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; title: string; at: string; bookCount: number;
            }>>`
                SELECT c.id, c.title, ${isoUtc(Prisma.sql`c."createdAt"`)} AS at,
                       (SELECT COUNT(*)::int FROM "CoupsDeCoeurBooks" cb WHERE cb."coupsDeCoeurId" = c.id) AS "bookCount"
                FROM "CoupsDeCoeur" c
                WHERE c."addedById" = ${actorId}
                  AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
                ORDER BY c."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: r.title,
                subtitle: `${r.bookCount} livre(s)`,
                href: '/admin/manage_coups_de_coeur',
            }));
        }

        case 'news': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; title: string; type: string; at: string;
            }>>`
                SELECT n.id, n.title, n.type, ${isoUtc(Prisma.sql`n."publishedAt"`)} AS at
                FROM "News" n
                WHERE n."authorId" = ${actorId}
                  AND n."publishedAt" >= ${from} AND n."publishedAt" < ${to}
                ORDER BY n."publishedAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: r.title,
                subtitle: r.type,
                href: `/admin/news?news=${r.id}`,
            }));
        }

        case 'auditEvents': {
            const rows = await prisma.$queryRaw<Array<{
                id: number; model: string; recordId: string; operation: AuditOperation; at: string;
            }>>`
                SELECT e.id, e.model, e."recordId", e.operation::text AS operation,
                       ${isoUtc(Prisma.sql`e."createdAt"`)} AS at
                FROM "AuditEvent" e
                WHERE ${actorCondition(Prisma.sql`e."actorId"`, actorId)}
                  AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
                ORDER BY e."createdAt" ASC
                LIMIT ${DETAILS_LIMIT}`;
            return rows.map((r) => ({
                id: r.id,
                at: r.at,
                title: `${modelLabel(r.model)}${r.recordId === '*' ? '' : ` n°${r.recordId}`}`,
                subtitle: OPERATION_LABELS[r.operation] ?? r.operation,
                href: recordHref(r.model, r.recordId),
            }));
        }
    }
}

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
        const response: StaffDetailsResponse = { items: await loadItems(metric, actorId, from, to) };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error fetching staff stat details:', error);
        return NextResponse.json({ message: 'Erreur lors du chargement du détail' }, { status: 500 });
    }
});
