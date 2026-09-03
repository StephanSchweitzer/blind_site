import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';
import { resolveRecordLabels } from '@/lib/audit/record-labels';
import { measureAuditTable } from '@/lib/audit/retention';
import { isoUtc } from '@/lib/stats';
import type { AuditChangeMap, AuditOperation, MyActivityItem, MyActivityResponse } from '@/types';

/**
 * « Mon activité récente » — the audit trail, narrowed to its author.
 *
 * Deliberately a route of its own rather than a parameter on /api/stats/audit,
 * which is super-admin-only and stays that way: the org-wide journal is a
 * different question from "what did I change?". Here the author is not a filter
 * a caller may choose — it is pinned to `me.id` in the SQL and there is no
 * actor parameter to send at all, so no request shape can widen this into
 * someone else's rows.
 *
 * Read-only on purpose. The trail's restore affordance belongs to /admin/stats,
 * where a super admin sees the whole picture before replaying a deletion; here
 * the snapshot is parsed to NAME a deleted record and never leaves the server.
 */

const PAGE_SIZE = 20;

interface ActivityRaw {
    id: number;
    at: string;
    model: string;
    recordId: string;
    operation: AuditOperation;
    changes: AuditChangeMap;
    /** DELETE snapshot as raw JSON — used to name the record, never forwarded. */
    snapshotText: string | null;
}

function parseSnapshot(json: string | null): Record<string, unknown> | null {
    if (!json) return null;
    try {
        const parsed: unknown = JSON.parse(json);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

export const GET = withAuth(async (request, { me }) => {
    const cursorRaw = request.nextUrl.searchParams.get('before');
    if (cursorRaw !== null && !/^\d+$/.test(cursorRaw)) {
        return NextResponse.json({ message: 'Curseur invalide' }, { status: 400 });
    }

    try {
        // Never scans past the retention window: the rows do not exist beyond
        // it, and the number is echoed back so an empty page can say why.
        const { retentionDays } = await measureAuditTable();

        const where = Prisma.sql`
            WHERE e."actorId" = ${me.id}
              AND e."createdAt" >= (now() - make_interval(days => ${retentionDays}))`;
        const pageWhere = cursorRaw
            ? Prisma.sql`${where} AND e.id < ${Number(cursorRaw)}`
            : where;

        const rows = await prisma.$queryRaw<ActivityRaw[]>`
            SELECT e.id, ${isoUtc(Prisma.sql`e."createdAt"`)} AS at,
                   e.model, e."recordId", e.operation::text AS operation, e.changes,
                   CASE WHEN e.operation = 'DELETE' THEN e.snapshot::text END AS "snapshotText"
            FROM "AuditEvent" e
            ${pageWhere}
            ORDER BY e.id DESC
            LIMIT ${PAGE_SIZE + 1}`;

        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

        const labels = await resolveRecordLabels(
            page.map((row) => ({
                id: row.id,
                model: row.model,
                recordId: row.recordId,
                snapshot: parseSnapshot(row.snapshotText),
                changes: row.changes ?? null,
                at: row.at,
            }))
        );

        const events: MyActivityItem[] = page.map((row) => ({
            id: row.id,
            at: row.at,
            model: row.model,
            recordId: row.recordId,
            operation: row.operation,
            recordLabel: labels.get(row.id) ?? null,
            changes: row.changes ?? {},
        }));

        const response: MyActivityResponse = {
            events,
            retentionDays,
            nextCursor: hasMore ? page[page.length - 1].id : null,
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Erreur lors du chargement de mon activité:', error);
        return NextResponse.json(
            { message: 'Erreur lors du chargement de votre activité' },
            { status: 500 }
        );
    }
});
