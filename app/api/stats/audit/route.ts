import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import { AUDIT_TABLE_SOFT_LIMIT_MB, isAuditedModel } from '@/lib/audit/config';
import { TRUNCATION_MARKER_RE } from '@/lib/audit/labels';
import { findRecordsByTerm, labelKey, resolveRecordLabels } from '@/lib/audit/record-labels';
import { measureAuditTable } from '@/lib/audit/retention';
import { isoUtc, parisDayStartUtc, parseDateParam } from '@/lib/stats';
import type {
    AuditChangeMap,
    AuditEventItem,
    AuditEventsResponse,
    AuditOperation,
    StatsActor,
} from '@/types';

// Journal des modifications — the paginated timeline behind /admin/stats.
//
// Never scans past the retention window, whatever the caller asks for: the rows
// simply do not exist beyond it, and pretending otherwise would let a wide date
// filter walk the whole table for nothing.

const PAGE_SIZE = 50;
const OPERATIONS: AuditOperation[] = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'];

interface AuditRaw {
    id: number;
    at: string;
    model: string;
    recordId: string;
    operation: AuditOperation;
    actorId: number | null;
    actorEmail: string | null;
    changes: AuditChangeMap;
    hasSnapshot: boolean;
    /**
     * The DELETE snapshot as raw JSON, for two server-side questions only: can
     * this deletion be replayed, and what was the record called. It is parsed
     * here and never forwarded to the client.
     */
    snapshotText: string | null;
}

interface RawUserName {
    id: number;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
}

/**
 * Why a deletion cannot be replayed, or null when it can.
 *
 * A snapshot whose values were truncated would restore a size marker into a real
 * column, which is worse than refusing — so it refuses, and says which is which.
 */
function restoreBlockerOf(row: AuditRaw, snapshot: Record<string, unknown> | null): string | null {
    if (row.operation !== 'DELETE') return null;
    if (!row.hasSnapshot) {
        return row.recordId === '*'
            ? 'Suppression groupée : aucun instantané n’a été conservé.'
            : 'Aucun instantané disponible pour cet enregistrement.';
    }
    if (!isAuditedModel(row.model)) {
        return 'Ce modèle n’est plus suivi par le journal.';
    }
    if (hasTruncatedValue(snapshot)) {
        return 'L’instantané contient des valeurs trop longues pour avoir été conservées.';
    }
    return null;
}

function hasTruncatedValue(snapshot: Record<string, unknown> | null): boolean {
    if (snapshot === null) return true;
    return Object.values(snapshot).some(
        (value) => typeof value === 'string' && TRUNCATION_MARKER_RE.test(value)
    );
}

/**
 * The snapshot, parsed once per row: both the restorability check and the
 * display label read it, and it is the only way to name a deleted record.
 * Nothing of it is ever sent to the client — only the two answers drawn from it.
 */
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

/** Longest « Enregistrement » term accepted — a filter, not a full-text engine. */
const MAX_SUBJECT_CHARS = 80;

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;

    const model = params.get('model');
    const operation = params.get('operation');
    const actorRaw = params.get('actor');
    const subject = params.get('subject')?.trim() ?? '';
    const start = parseDateParam(params.get('start'));
    const end = parseDateParam(params.get('end'));
    const cursorRaw = params.get('before');

    if (model !== null && !isAuditedModel(model)) {
        return NextResponse.json({ message: 'Modèle inconnu' }, { status: 400 });
    }
    if (operation !== null && !OPERATIONS.includes(operation as AuditOperation)) {
        return NextResponse.json({ message: 'Opération inconnue' }, { status: 400 });
    }
    if (actorRaw !== null && !/^\d+$/.test(actorRaw)) {
        return NextResponse.json({ message: 'Auteur invalide' }, { status: 400 });
    }
    if (cursorRaw !== null && !/^\d+$/.test(cursorRaw)) {
        return NextResponse.json({ message: 'Curseur invalide' }, { status: 400 });
    }
    if (subject.length > MAX_SUBJECT_CHARS) {
        return NextResponse.json({ message: 'Recherche trop longue' }, { status: 400 });
    }

    try {
        const retention = await measureAuditTable();

        // The hard floor. A caller-supplied `start` may narrow it, never widen it.
        const filters: Prisma.Sql[] = [
            Prisma.sql`e."createdAt" >= (now() - make_interval(days => ${retention.retentionDays}))`,
        ];
        if (start) filters.push(Prisma.sql`e."createdAt" >= ${parisDayStartUtc(start)}`);
        if (end) filters.push(Prisma.sql`e."createdAt" < ${parisDayStartUtc(end)}`);
        if (model) filters.push(Prisma.sql`e.model = ${model}`);
        if (operation) filters.push(Prisma.sql`e.operation = ${operation}::"AuditOperation"`);
        if (actorRaw) {
            const actorId = Number(actorRaw);
            filters.push(
                actorId === 0
                    ? Prisma.sql`e."actorId" IS NULL`
                    : Prisma.sql`e."actorId" = ${actorId}`
            );
        }
        if (subject) {
            // Resolved against the real tables first (that is where titles and
            // names are indexed), then applied here as (model, recordId) pairs —
            // which is exactly what @@index([model, recordId]) serves. A term
            // that matches nothing must return nothing, not everything.
            const matches = await findRecordsByTerm(subject);
            filters.push(
                matches.length === 0
                    ? Prisma.sql`false`
                    : Prisma.sql`(${Prisma.join(
                          matches.map(
                              (match) => Prisma.sql`(e.model = ${match.model} AND e."recordId" IN (${Prisma.join(match.recordIds)}))`
                          ),
                          ' OR '
                      )})`
            );
        }

        const where = Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`;
        const pageWhere = cursorRaw
            ? Prisma.sql`${where} AND e.id < ${Number(cursorRaw)}`
            : where;

        const [rows, models, actorIds] = await Promise.all([
            prisma.$queryRaw<AuditRaw[]>`
                SELECT e.id, ${isoUtc(Prisma.sql`e."createdAt"`)} AS at,
                       e.model, e."recordId", e.operation::text AS operation,
                       e."actorId", e."actorEmail", e.changes,
                       (e.snapshot IS NOT NULL) AS "hasSnapshot",
                       -- The snapshot itself never leaves the server; only the
                       -- question "is it usable?" is answered here.
                       CASE WHEN e.operation = 'DELETE' THEN e.snapshot::text END AS "snapshotText"
                FROM "AuditEvent" e
                ${pageWhere}
                ORDER BY e.id DESC
                LIMIT ${PAGE_SIZE + 1}`,

            // Facets come from the window, not from the registry: offering a
            // filter that can only ever return nothing is a dead end.
            prisma.$queryRaw<Array<{ model: string }>>`
                SELECT DISTINCT e.model FROM "AuditEvent" e ${where} ORDER BY 1`,

            prisma.$queryRaw<Array<{ actorId: number | null }>>`
                SELECT DISTINCT e."actorId" FROM "AuditEvent" e ${where}`,
        ]);

        const hasMore = rows.length > PAGE_SIZE;
        const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

        // Raw on purpose: the soft-delete extension hides deleted users from
        // findMany, but the trail must keep naming its author either way.
        const realIds = actorIds.map((a) => a.actorId).filter((id): id is number => id !== null);
        const users = realIds.length
            ? await prisma.$queryRaw<RawUserName[]>`
                SELECT id, name, "firstName", "lastName", email
                FROM "User"
                WHERE id IN (${Prisma.join(realIds)})`
            : [];
        const nameById = new Map(users.map((u) => [u.id, getUserDisplayName(u)]));

        const actors: StatsActor[] = realIds
            .map((id) => ({ id, name: nameById.get(id) ?? `Personne n°${id}` }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        if (actorIds.some((a) => a.actorId === null)) actors.unshift({ id: 0, name: 'Système' });

        // Parsed once per row and kept server-side: the restore check reads it,
        // and it is the only place a deleted record's name still exists.
        const snapshots = new Map(page.map((row) => [row.id, parseSnapshot(row.snapshotText)]));

        const labels = await resolveRecordLabels(
            page.map((row) => ({
                model: row.model,
                recordId: row.recordId,
                snapshot: snapshots.get(row.id) ?? null,
            }))
        );

        const events: AuditEventItem[] = page.map((row) => {
            const blocker = restoreBlockerOf(row, snapshots.get(row.id) ?? null);
            return {
                id: row.id,
                at: row.at,
                model: row.model,
                recordId: row.recordId,
                operation: row.operation,
                actorId: row.actorId,
                actorName:
                    (row.actorId !== null ? nameById.get(row.actorId) : null) ??
                    row.actorEmail ??
                    'Système',
                recordLabel: labels.get(labelKey(row.model, row.recordId)) ?? null,
                changes: row.changes ?? {},
                restorable: row.operation === 'DELETE' && blocker === null,
                restoreBlocker: blocker,
            };
        });

        const response: AuditEventsResponse = {
            events,
            models: models.map((m) => m.model),
            actors,
            retention: { ...retention, softLimitMb: AUDIT_TABLE_SOFT_LIMIT_MB },
            nextCursor: hasMore ? page[page.length - 1].id : null,
        };
        return NextResponse.json(response);
    } catch (error) {
        console.error('Error loading audit events:', error);
        return NextResponse.json(
            { message: 'Erreur lors du chargement du journal' },
            { status: 500 }
        );
    }
});
