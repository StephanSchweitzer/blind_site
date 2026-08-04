import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { getUserDisplayName } from '@/lib/users/displayName';
import { AUDIT_TABLE_SOFT_LIMIT_MB, isAuditedModel } from '@/lib/audit/config';
import { TRUNCATION_MARKER_RE } from '@/lib/audit/labels';
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
    /** Whether any snapshot value was replaced by a size marker on the way in. */
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
function restoreBlockerOf(row: AuditRaw): string | null {
    if (row.operation !== 'DELETE') return null;
    if (!row.hasSnapshot) {
        return row.recordId === '*'
            ? 'Suppression groupée : aucun instantané n’a été conservé.'
            : 'Aucun instantané disponible pour cet enregistrement.';
    }
    if (!isAuditedModel(row.model)) {
        return 'Ce modèle n’est plus suivi par le journal.';
    }
    if (row.snapshotText && hasTruncatedValue(row.snapshotText)) {
        return 'L’instantané contient des valeurs trop longues pour avoir été conservées.';
    }
    return null;
}

function hasTruncatedValue(snapshotJson: string): boolean {
    try {
        const snapshot = JSON.parse(snapshotJson) as Record<string, unknown>;
        return Object.values(snapshot).some(
            (value) => typeof value === 'string' && TRUNCATION_MARKER_RE.test(value)
        );
    } catch {
        return true;
    }
}

export const GET = withSuperAdmin(async (request) => {
    const params = request.nextUrl.searchParams;

    const model = params.get('model');
    const operation = params.get('operation');
    const actorRaw = params.get('actor');
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

        const events: AuditEventItem[] = page.map((row) => ({
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
            changes: row.changes ?? {},
            restorable: row.operation === 'DELETE' && restoreBlockerOf(row) === null,
            restoreBlocker: restoreBlockerOf(row),
        }));

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
