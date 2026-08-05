import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';
import {
    AUDITED_OPERATIONS,
    BULK_COUNT_KEY,
    BULK_RECORD_ID,
    BULK_ROW_LIMIT,
    changesAreAllDerived,
    isAuditedModel,
    primaryKeyFields,
    recordIdOf,
} from './config';
import {
    AuditChanges,
    AuditSnapshot,
    creationChanges,
    diffRows,
    encodeSnapshot,
    encodeValue,
    withinPayloadBudget,
} from './diff';
import { getAuditActor, isAuditBypassed } from './context';

/**
 * Prisma client extension that turns every write to an audited model into an
 * AuditEvent row — automatically, so no future route, action or script can
 * forget to log. There are deliberately no per-action logging calls anywhere in
 * the codebase.
 *
 * Shape of the capture:
 *   create            → one CREATE event, changes = { champ: [null, valeur] }
 *   update / upsert    → one UPDATE event, changes = the fields that MOVED only
 *   delete             → one DELETE event, changes = {}, snapshot = the full row
 *   updateMany/deleteMany → one event per row up to BULK_ROW_LIMIT, then a
 *                        single summary event instead
 *
 * Cost: one extra read before an update/delete (the "before" state). The "after"
 * state is normally derived from the write's own `data`, so a plain field edit
 * costs one added query, not two. When `data` contains an atomic operation
 * (increment/decrement/…) the row is re-read instead, because guessing would put
 * a wrong value in an audit trail.
 *
 * Known limits, stated rather than hidden:
 *   - $queryRaw / $executeRaw bypass Prisma's query pipeline entirely and are
 *     therefore invisible here;
 *   - nested writes (`genres: { deleteMany: {} }`) are captured as part of the
 *     PARENT row's event, not as events of their own;
 *   - the audit row is written after the observed write succeeds, on the base
 *     client. If the surrounding $transaction later rolls back, the event
 *     survives it — the trail may over-report, it never under-reports.
 */

type Row = Record<string, unknown>;

interface Delegate {
    findFirst(args: unknown): Promise<Row | null>;
    findMany(args: unknown): Promise<Row[]>;
}

type Operation = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

interface AuditRowInput {
    model: string;
    recordId: string;
    operation: Operation;
    changes: AuditChanges;
    snapshot?: AuditSnapshot | null;
}

const ATOMIC_OPS = new Set(['increment', 'decrement', 'multiply', 'divide']);

/** Delegate lookup: Prisma exposes model `Orders` as client key `orders`. */
function delegateFor(base: PrismaClient, model: string): Delegate | null {
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (base as unknown as Record<string, unknown>)[key];
    return delegate && typeof delegate === 'object' ? (delegate as Delegate) : null;
}

/** Run an audit-side step; log and give up rather than break the real write. */
async function safely<T>(label: string, step: () => Promise<T>): Promise<T | null> {
    try {
        return await step();
    } catch (error) {
        console.error(`[audit] ${label} — capture abandonnée:`, error);
        return null;
    }
}

function isWrapperObject(value: unknown): value is Row {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof Prisma.Decimal) &&
        !(value instanceof Uint8Array) &&
        !Buffer.isBuffer(value)
    );
}

/**
 * Project a write's `data` onto the row it is about to change.
 *
 * `exact` is false only when the result cannot be known without asking the
 * database back — today, atomic numeric operations. Nested relation writes leave
 * it true: they change other tables, not this row's scalar columns.
 */
function applyData(before: Row, data: unknown): { after: Row; exact: boolean } {
    const after: Row = { ...before };
    let exact = true;
    if (!isWrapperObject(data)) return { after, exact };

    for (const [field, raw] of Object.entries(data)) {
        if (raw === undefined) continue;

        if (isWrapperObject(raw)) {
            const keys = Object.keys(raw);
            if (keys.some((key) => ATOMIC_OPS.has(key))) {
                exact = false;
                continue;
            }
            if ('set' in raw) {
                after[field] = raw.set;
                continue;
            }
            // connect / create / update / disconnect… — another table's business.
            continue;
        }

        after[field] = raw;
    }

    return { after, exact };
}

/** recordId when the row itself could not be read — best effort from `where`. */
function recordIdFromWhere(model: string, where: unknown): string | null {
    return isWrapperObject(where) ? recordIdOf(model, where) : null;
}

async function loadBefore(
    base: PrismaClient,
    model: string,
    operation: string,
    where: unknown
): Promise<Row | Row[] | null> {
    const delegate = delegateFor(base, model);
    if (!delegate || where === undefined) return null;

    if (operation === 'update' || operation === 'upsert' || operation === 'delete') {
        return delegate.findFirst({ where });
    }
    if (operation === 'updateMany' || operation === 'updateManyAndReturn' || operation === 'deleteMany') {
        // One row over the cap is enough to know the write is a mass operation.
        return delegate.findMany({ where, take: BULK_ROW_LIMIT + 1 });
    }
    return null;
}

/** Re-read rows whose post-write state could not be derived from `data`. */
async function reread(base: PrismaClient, model: string, rows: Row[]): Promise<Map<string, Row>> {
    const fresh = new Map<string, Row>();
    const delegate = delegateFor(base, model);
    const fields = primaryKeyFields(model);
    if (!delegate || fields.length !== 1) return fresh;

    const ids = rows.map((row) => row[fields[0]]).filter((id) => id !== undefined && id !== null);
    if (ids.length === 0) return fresh;

    for (const row of await delegate.findMany({ where: { [fields[0]]: { in: ids } } })) {
        const recordId = recordIdOf(model, row);
        if (recordId) fresh.set(recordId, row);
    }
    return fresh;
}

/** The `{ champ: [null, valeur] }` shape used by a bulk summary's `data`. */
function summaryChanges(data: unknown, count: number): AuditChanges {
    const changes: AuditChanges = { [BULK_COUNT_KEY]: [null, count] };
    if (!isWrapperObject(data)) return changes;

    for (const [field, raw] of Object.entries(data)) {
        if (raw === undefined) continue;
        const value = isWrapperObject(raw) ? ('set' in raw ? raw.set : undefined) : raw;
        if (value === undefined) continue;
        changes[field] = [null, encodeValue(value)];
    }
    return changes;
}

interface BuildArgs {
    base: PrismaClient;
    model: string;
    operation: string;
    where: unknown;
    data: unknown;
    before: Row | Row[] | null;
    result: unknown;
    /**
     * True when the caller narrowed the write with `select`. The returned row is
     * then a projection, not the record — so it cannot stand in for the "after"
     * state and the write's own `data` is used instead.
     */
    narrowed: boolean;
}

async function buildEvents({
    base,
    model,
    operation,
    where,
    data,
    before,
    result,
    narrowed,
}: BuildArgs): Promise<AuditRowInput[]> {
    // ── creations ───────────────────────────────────────────────────────────
    if (operation === 'create') {
        if (!isWrapperObject(result)) return [];
        const recordId = recordIdOf(model, result);
        if (!recordId) return [];
        // Under `select`, what came back is a few columns; the requested `data`
        // fills the rest (DB defaults are the only thing missing either way).
        const row = narrowed ? { ...applyData({}, data).after, ...result } : result;
        return [{ model, recordId, operation: 'CREATE', changes: creationChanges(row, primaryKeyFields(model)) }];
    }

    if (operation === 'createManyAndReturn' && Array.isArray(result)) {
        if (result.length > BULK_ROW_LIMIT) {
            return [{
                model,
                recordId: BULK_RECORD_ID,
                operation: 'CREATE',
                changes: { [BULK_COUNT_KEY]: [null, result.length] },
            }];
        }
        return (result as Row[]).flatMap((row) => {
            const recordId = recordIdOf(model, row);
            return recordId
                ? [{ model, recordId, operation: 'CREATE' as const, changes: creationChanges(row, primaryKeyFields(model)) }]
                : [];
        });
    }

    if (operation === 'createMany') {
        // No rows come back: the trail records the batch, not its contents.
        const count = isWrapperObject(result) && typeof result.count === 'number' ? result.count : 0;
        if (count === 0) return [];
        return [{
            model,
            recordId: BULK_RECORD_ID,
            operation: 'CREATE',
            changes: { [BULK_COUNT_KEY]: [null, count] },
        }];
    }

    // ── single-row update / upsert ──────────────────────────────────────────
    if (operation === 'update' || operation === 'upsert') {
        const prior = Array.isArray(before) ? null : before;

        // An upsert that found nothing created the row instead.
        if (!prior) {
            if (operation !== 'upsert' || !isWrapperObject(result)) return [];
            const recordId = recordIdOf(model, result);
            return recordId
                ? [{ model, recordId, operation: 'CREATE', changes: creationChanges(result, primaryKeyFields(model)) }]
                : [];
        }

        const recordId = recordIdOf(model, prior);
        if (!recordId) return [];

        // update and upsert both hand back the row they wrote: that IS the
        // "after" state, for free. Only a `select` (partial row) or an atomic
        // operation sends us back to the database.
        const projected = applyData(prior, data);
        const after = !narrowed && isWrapperObject(result) && recordIdOf(model, result) === recordId
            ? { ...prior, ...result }
            : projected.exact
                ? projected.after
                : (await reread(base, model, [prior])).get(recordId) ?? projected.after;

        const changes = diffRows(prior, after);
        // A write that moved nothing is not a change worth a row — and neither is
        // one that only moved machine-derived columns: that is a re-read, not a
        // decision.
        if (Object.keys(changes).length === 0 || changesAreAllDerived(model, changes)) return [];
        return [{ model, recordId, operation: 'UPDATE', changes }];
    }

    // ── single-row delete ───────────────────────────────────────────────────
    if (operation === 'delete') {
        const prior = Array.isArray(before) ? null : before;
        const recordId = prior ? recordIdOf(model, prior) : recordIdFromWhere(model, where);
        if (!recordId) return [];
        return [{
            model,
            recordId,
            operation: 'DELETE',
            changes: {},
            snapshot: prior ? encodeSnapshot(prior) : null,
        }];
    }

    // ── bulk update ─────────────────────────────────────────────────────────
    if (operation === 'updateMany' || operation === 'updateManyAndReturn') {
        const rows = Array.isArray(before) ? before : [];
        if (rows.length === 0) return [];
        if (rows.length > BULK_ROW_LIMIT) {
            const count = isWrapperObject(result) && typeof result.count === 'number'
                ? result.count
                : rows.length;
            return [{
                model,
                recordId: BULK_RECORD_ID,
                operation: 'UPDATE',
                changes: summaryChanges(data, count),
            }];
        }

        const projections = rows.map((row) => ({ row, ...applyData(row, data) }));
        const fresh = projections.some((p) => !p.exact)
            ? await reread(base, model, rows)
            : new Map<string, Row>();

        return projections.flatMap(({ row, after, exact }) => {
            const recordId = recordIdOf(model, row);
            if (!recordId) return [];
            const resolved = exact ? after : fresh.get(recordId) ?? after;
            const changes = diffRows(row, resolved);
            if (Object.keys(changes).length === 0 || changesAreAllDerived(model, changes)) return [];
            return [{ model, recordId, operation: 'UPDATE' as const, changes }];
        });
    }

    // ── bulk delete ─────────────────────────────────────────────────────────
    if (operation === 'deleteMany') {
        const rows = Array.isArray(before) ? before : [];
        if (rows.length === 0) return [];
        if (rows.length > BULK_ROW_LIMIT) {
            const count = isWrapperObject(result) && typeof result.count === 'number'
                ? result.count
                : rows.length;
            // Past the cap the snapshots are dropped, so these rows are NOT
            // restorable from the trail. That is the deliberate storage trade.
            return [{
                model,
                recordId: BULK_RECORD_ID,
                operation: 'DELETE',
                changes: { [BULK_COUNT_KEY]: [null, count] },
            }];
        }
        return rows.flatMap((row) => {
            const recordId = recordIdOf(model, row);
            return recordId
                ? [{
                    model,
                    recordId,
                    operation: 'DELETE' as const,
                    changes: {},
                    snapshot: encodeSnapshot(row),
                }]
                : [];
        });
    }

    return [];
}

/** Backstop against a pathologically large payload reaching the table. */
function fitBudget(row: AuditRowInput): AuditRowInput {
    if (withinPayloadBudget(row.changes) && withinPayloadBudget(row.snapshot ?? {})) return row;
    return {
        ...row,
        changes: { _tronque: [null, 'contenu trop volumineux pour être tracé'] },
        snapshot: withinPayloadBudget(row.snapshot ?? {}) ? row.snapshot : null,
    };
}

export async function writeAuditEvents(base: PrismaClient, rows: AuditRowInput[]): Promise<void> {
    if (rows.length === 0) return;
    const actor = getAuditActor();

    await base.auditEvent.createMany({
        data: rows.map(fitBudget).map((row) => ({
            model: row.model,
            recordId: row.recordId,
            operation: row.operation,
            actorId: actor?.actorId ?? null,
            actorEmail: actor?.actorEmail ?? null,
            changes: row.changes,
            snapshot: row.snapshot ?? Prisma.DbNull,
        })),
    });
}

export function auditExtension(base: PrismaClient) {
    return Prisma.defineExtension({
        name: 'auditTrail',
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (
                        !isAuditedModel(model) ||
                        !AUDITED_OPERATIONS.has(operation) ||
                        isAuditBypassed()
                    ) {
                        return query(args);
                    }

                    const call = (args ?? {}) as {
                        where?: unknown;
                        data?: unknown;
                        update?: unknown;
                        select?: unknown;
                    };
                    // upsert carries its edit under `update`, everything else under `data`.
                    const data = operation === 'upsert' ? call.update : call.data;

                    const before = await safely(`${model}.${operation} (état avant)`, () =>
                        loadBefore(base, model, operation, call.where)
                    );

                    // Deliberately outside every try/catch: a real failure of the
                    // write must surface to the caller untouched, and must not be
                    // retried by the audit path.
                    const result = await query(args);

                    await safely(`${model}.${operation}`, async () => {
                        const events = await buildEvents({
                            base,
                            model,
                            operation,
                            where: call.where,
                            data,
                            before,
                            result,
                            narrowed: call.select !== undefined,
                        });
                        await writeAuditEvents(base, events);
                    });

                    return result;
                },
            },
        },
    });
}
