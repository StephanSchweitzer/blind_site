import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withSuperAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { isAuditedModel } from '@/lib/audit/config';
import { withoutAudit } from '@/lib/audit/context';
import { TRUNCATION_MARKER_RE, modelLabel } from '@/lib/audit/labels';
import { resolveRecordLabels } from '@/lib/audit/record-labels';
import type { AuditChangeMap, AuditRestoreResponse } from '@/types';

/**
 * Replay a deletion recorded in the last 14 days.
 *
 * Super-admin only, and deliberately unforgiving. It refuses — loudly, with the
 * reason — rather than doing something approximate:
 *   - if the event is not a DELETE, or carries no snapshot;
 *   - if a record already exists at that id (it will NEVER overwrite one);
 *   - if the snapshot holds a value that was truncated on the way in, because
 *     restoring "[texte de 1200 caractères]" into a real column is worse than
 *     not restoring at all;
 *   - if the row it referenced is itself gone (a foreign key that no longer
 *     resolves) — Postgres says so and the message is passed through.
 *
 * The restore is itself audited, as a RESTORE event naming the event it replayed.
 */

const failure = (message: string, status: number) =>
    NextResponse.json<AuditRestoreResponse>({ success: false, message }, { status });

export const POST = withSuperAdmin(async (request, ctx) => {
    const { id: idRaw } = (await ctx.params) ?? {};
    if (!idRaw || !/^\d+$/.test(idRaw)) return failure('Événement invalide.', 400);
    const eventId = Number(idRaw);

    // An explicit confirmation travels with the request: the dialog is the
    // user-facing step, this is the one a stray POST cannot satisfy by accident.
    const body = await request.json().catch(() => null);
    if (!body || body.confirm !== true) {
        return failure('Restauration non confirmée.', 400);
    }

    const event = await prisma.auditEvent.findUnique({ where: { id: eventId } });
    if (!event) return failure('Événement introuvable — il a peut-être été purgé.', 404);

    if (event.operation !== 'DELETE') {
        return failure('Seule une suppression peut être restaurée.', 400);
    }
    if (!event.snapshot || typeof event.snapshot !== 'object' || Array.isArray(event.snapshot)) {
        return failure(
            'Aucun instantané n’a été conservé pour cette suppression : elle ne peut pas être rejouée.',
            422
        );
    }
    if (!isAuditedModel(event.model)) {
        return failure('Ce modèle n’est plus suivi par le journal.', 422);
    }
    if (!/^\d+$/.test(event.recordId)) {
        return failure('Cet événement ne désigne pas un enregistrement unique.', 422);
    }

    const snapshot = event.snapshot as Record<string, Prisma.JsonValue>;
    const truncated = Object.entries(snapshot)
        .filter(([, value]) => typeof value === 'string' && TRUNCATION_MARKER_RE.test(value))
        .map(([field]) => field);
    if (truncated.length > 0) {
        return failure(
            `Restauration impossible : les champs ${truncated.join(', ')} n’ont pas été conservés ` +
            `intégralement (valeurs trop longues). Restaurer écrirait un marqueur à leur place.`,
            422
        );
    }

    // Model name comes from our own registry, never from the request — safe to
    // interpolate as an identifier.
    const quoted = `"${event.model}"`;
    const table = Prisma.raw(quoted);
    const recordId = Number(event.recordId);

    try {
        // Authoritative existence check in raw SQL: a soft-deleted User is hidden
        // from findUnique-style reads but very much still occupies its id.
        const existing = await prisma.$queryRaw<Array<{ one: number }>>`
            SELECT 1 AS one FROM ${table} WHERE id = ${recordId} LIMIT 1`;
        if (existing.length > 0) {
            return failure(
                `Un enregistrement porte déjà l’identifiant ${recordId} (${modelLabel(event.model)}). ` +
                `La restauration est annulée : elle n’écrase jamais un enregistrement existant.`,
                409
            );
        }

        const delegate = (prisma as unknown as Record<string, {
            create(args: { data: unknown }): Promise<unknown>;
        }>)[event.model.charAt(0).toLowerCase() + event.model.slice(1)];
        if (!delegate) return failure('Modèle inconnu.', 422);

        // The write itself is not traced as a CREATE: the RESTORE event below
        // says the same thing, once, and names its source.
        await withoutAudit(() => delegate.create({ data: snapshot }));

        // An explicit id does not advance the sequence, so the next create would
        // collide with the row just restored. Skipped for the models whose id is
        // not a serial (SiteContact), where there is no sequence to advance.
        await prisma.$executeRaw`
            SELECT setval(s.seq, GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1))
            FROM (SELECT pg_get_serial_sequence(${quoted}, 'id') AS seq) s
            WHERE s.seq IS NOT NULL`;

        const changes: AuditChangeMap = { _source: [null, event.id] };
        for (const [field, value] of Object.entries(snapshot)) {
            if (field === 'id') continue;
            changes[field] = [
                null,
                typeof value === 'object' && value !== null ? JSON.stringify(value) : value,
            ];
        }

        await prisma.auditEvent.create({
            data: {
                model: event.model,
                recordId: event.recordId,
                operation: 'RESTORE',
                actorId: ctx.me.id,
                actorEmail: ctx.me.email,
                changes,
            },
        });

        revalidateAdmin();
        // Password hashes are never written to the trail, so a restored account
        // comes back without one and has to go through a reset.
        const caveat = event.model === 'User'
            ? ' Le mot de passe n’a pas été conservé : la personne devra le réinitialiser.'
            : '';
        // The snapshot just written back is exactly what would name this record
        // in the journal — reused here so the toast reads « Le Ventre de Paris »
        // rather than the id alone.
        const labels = await resolveRecordLabels([
            { id: event.id, model: event.model, recordId: event.recordId, snapshot, changes: null },
        ]);
        const label = labels.get(event.id);
        const named = label
            ? `${modelLabel(event.model)} n°${recordId} (${label.title}${label.subtitle ? ` — ${label.subtitle}` : ''})`
            : `${modelLabel(event.model)} n°${recordId}`;
        return NextResponse.json<AuditRestoreResponse>({
            success: true,
            message: `${named} restauré.${caveat}`,
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                return failure(
                    'Restauration impossible : une valeur unique de cet enregistrement ' +
                    '(e-mail, ISBN…) est déjà utilisée par un autre.',
                    409
                );
            }
            if (error.code === 'P2003') {
                return failure(
                    'Restauration impossible : un enregistrement lié a lui aussi été supprimé. ' +
                    'Restaurez-le d’abord.',
                    422
                );
            }
        }
        console.error('Error restoring audit event:', error);
        return failure('La restauration a échoué.', 500);
    }
});
