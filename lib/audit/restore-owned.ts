import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withoutAudit } from './context';
import { AuditChanges } from './diff';
import { OWNED_SNAPSHOT_KEY, collectionDelta, restorableCollectionsOf } from './owned-collections';

type Row = Record<string, unknown>;

interface ChildDelegate {
    create(args: { data: Row }): Promise<unknown>;
    createMany(args: { data: Row[] }): Promise<unknown>;
    findMany(args: unknown): Promise<Row[]>;
}

const delegateFor = (model: string): ChildDelegate =>
    (prisma as unknown as Record<string, ChildDelegate>)[model.charAt(0).toLowerCase() + model.slice(1)];

/** A snapshot without the owned rows — what the owner's own `create` accepts. */
export function ownerColumns(snapshot: Record<string, Prisma.JsonValue>): Record<string, Prisma.JsonValue> {
    const { [OWNED_SNAPSHOT_KEY]: _owned, ...columns } = snapshot;
    return columns;
}

export interface OwnedRestore {
    /** Diff lines for the RESTORE event: what came back, in the journal's words. */
    changes: AuditChanges;
    /** Sentence for the toast, empty when the record owned nothing. */
    note: string;
}

const counted = (count: number, [one, many]: [string, string]) => `${count} ${count > 1 ? many : one}`;

/**
 * Put back the collections a deleted owner carried in its snapshot
 * (`restorable` in ./owned-collections), once the owner row exists again.
 *
 * A row whose other end has gone since — a book deleted after the liste was —
 * cannot come back, and must not stop the others: the batch is tried whole,
 * and on a foreign-key refusal row by row, the casualties counted and named in
 * the note. Not traced on its own: the RESTORE event says it, once.
 */
export async function restoreOwnedCollections(
    owner: string,
    ownerId: number,
    snapshot: Record<string, Prisma.JsonValue>
): Promise<OwnedRestore> {
    const raw = snapshot[OWNED_SNAPSHOT_KEY];
    if (typeof raw !== 'string') return { changes: {}, note: '' };
    let stored: Record<string, Row[]>;
    try {
        stored = JSON.parse(raw);
    } catch {
        return { changes: {}, note: '' };
    }

    const changes: AuditChanges = {};
    const notes: string[] = [];

    for (const [child, spec] of restorableCollectionsOf(owner)) {
        const rows = (stored[child] ?? []).map((row) => ({ ...row, [spec.ownerKey]: ownerId }));
        if (rows.length === 0) continue;
        const delegate = delegateFor(child);

        let missing = 0;
        try {
            await withoutAudit(() => delegate.createMany({ data: rows }));
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003') throw error;
            for (const row of rows) {
                try {
                    await withoutAudit(() => delegate.create({ data: row }));
                } catch (rowError) {
                    if (rowError instanceof Prisma.PrismaClientKnownRequestError && rowError.code === 'P2003') {
                        missing += 1;
                    } else {
                        throw rowError;
                    }
                }
            }
        }

        const back = await delegate.findMany({
            where: { [spec.ownerKey]: ownerId },
            ...(spec.include ? { include: spec.include } : {}),
        });
        Object.assign(changes, collectionDelta(spec, [], back));

        const noun = spec.restorable!.noun;
        if (back.length > 0) notes.push(`${counted(back.length, noun)} ${back.length > 1 ? 'ont' : 'a'} été rattaché${back.length > 1 ? 's' : ''}.`);
        if (missing > 0) {
            const plural = missing > 1;
            notes.push(
                `${counted(missing, noun)} n’${plural ? 'existent' : 'existe'} plus et n’${plural ? 'ont' : 'a'} ` +
                `pas pu être rattaché${plural ? 's' : ''}.`
            );
        }
    }

    return { changes, note: notes.length > 0 ? ` ${notes.join(' ')}` : '' };
}
