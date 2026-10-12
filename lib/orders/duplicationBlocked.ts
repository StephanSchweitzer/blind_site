import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { STATUS, type TransactionClient } from '@/lib/statusSync';
import { getUserNameOnly } from '@/lib/users/displayName';

/**
 * A duplication is « À faire » — it's meant to be done straight away. The one
 * case where it can't be is when the book has no audio *yet* because a lecteur
 * is still recording it. That dependency is not modelled: a duplication owns no
 * attribution (see guardNotDuplication), so the only thing it shares with the
 * recording is the book. It is therefore derived on read, never stored — the
 * recording coming back (its audio in the bucket) unblocks it without anything
 * touching the demande, and a stored flag would silently go stale at exactly
 * that moment.
 */

/** Both statuses block: a book that hasn't gone out to a lecteur yet is just as unavailable. */
export const RECORDING_UNDER_WAY: number[] = [STATUS.ATTENTE, STATUS.EN_COURS];

/** A closed demande waits for nothing — whatever the book is doing is no longer its problem. */
const DEMANDE_CLOSED: number[] = [STATUS.TERMINE, STATUS.SOLDE];

/**
 * An open demande d'enregistrement also blocks, attribution or not. The two
 * demandes usually meet before any lecteur is found (half the books wait about
 * three weeks for one), and checking attributions alone made the duplication
 * look doable — and start its clock — for that whole time. Its status must still
 * be a recording one: « Attente envoi vers auditeur » means the recording is
 * back, and if that brought no audio, nothing more is coming. Nested reads must
 * add `deletedAt: null` themselves (lib/prisma.ts).
 */
export const RECORDING_DEMANDE_UNDER_WAY = {
    lentPhysicalBook: true,
    closureDate: null,
    statusId: { in: RECORDING_UNDER_WAY },
} satisfies Prisma.OrdersWhereInput;

/*
 * The « Duplication réalisable » / « après enregistrement » / « sans enregistrement
 * prévu » filters and the dashboard counts read the same derivation off the délais
 * (lib/orders/delais.ts, `duplicationStateWhere`) — no Prisma copy of it here.
 */

/**
 * The open duplications of a book whose recording has just come back, named in
 * the toast of the attribution that finishes it.
 *
 * This is the case that used to disappear silently. A demande d'enregistrement
 * comes in for a book; while the lecteur has it, a second auditeur asks for the
 * same book, so that second demande is a duplication with nothing to copy yet.
 * When the enregistrement finally comes back, the person finishing the
 * attribution is looking at the FIRST demande and has no reason to suspect the
 * second exists. Naming them at that exact moment is the only place the two
 * ever meet.
 *
 * Every open duplication of the book, not just the ones that were blocked. The
 * lookup used to require `audio_filepath: null`, which made it dead code: an
 * attribution only reaches « Terminé » once the book holds weighed audio, which
 * needs a folder, so by then `audio_filepath` is always set. Telling « was
 * waiting » from « was placed during a re-reading » would need history nothing
 * keeps, and doesn't change the answer either way — the audio is here, and
 * every one of them can be done now.
 *
 * Same « open » as the délais (closure date AND status), so the toast never
 * names a demande the dashboard considers done. Call inside the finishing
 * transaction, only when the attribution finished WITH audio.
 */
export async function findOpenDuplicationsOfBook(
    tx: TransactionClient,
    catalogueId: number
): Promise<number[]> {
    const open = await tx.orders.findMany({
        where: {
            isDuplication: true,
            catalogueId,
            closureDate: null,
            statusId: { notIn: DEMANDE_CLOSED },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    return open.map((o) => o.id);
}

/**
 * What an open duplication of a book with no audio is waiting for:
 *  - `lecteur` — an attribution « Attente » / « En cours » (named when known);
 *  - `demande` — an open demande d'enregistrement no attribution carries yet;
 *  - `aucun`   — nothing. Nobody is recording the book, so the duplication can
 *    never be done as it stands: the case that gets forgotten, flagged on the
 *    dashboard (« Duplications sans enregistrement prévu »).
 * Same rule as the délais (lib/orders/delais.ts, `computeDelai`).
 */
export type DuplicationWait =
    | { kind: 'lecteur'; readerName: string | null; sentToReaderDate: Date | null }
    | { kind: 'demande'; orderId: number }
    | { kind: 'aucun' };

type OrderRowLike = {
    id: number;
    catalogueId: number;
    statusId: number;
    isDuplication: boolean;
    closureDate: Date | null;
    catalogue: { audio_filepath: string | null };
};

/**
 * Of the given demandes, what each open duplication of a book with no audio is
 * waiting for — keyed by demande id, carrying enough context to name the
 * lecteur or the demande d'enregistrement in the UI.
 *
 * Two queries for the whole page. Two things exclude a duplication before any
 * query runs: a book that *already* has audio (the copy can be made right now,
 * even if a re-reading happens to be under way), and a demande that is already
 * closed (a « Terminé » duplication is done — it waits for nothing).
 */
export async function findBlockedDuplications(
    orders: OrderRowLike[]
): Promise<Map<number, DuplicationWait>> {
    const waiting = orders.filter(
        (o) =>
            o.isDuplication &&
            !o.catalogue.audio_filepath &&
            o.closureDate === null &&
            !DEMANDE_CLOSED.includes(o.statusId)
    );
    if (waiting.length === 0) return new Map();

    const catalogueIds = [...new Set(waiting.map((o) => o.catalogueId))];
    const [recordings, demandes] = await Promise.all([
        prisma.assignment.findMany({
            where: {
                catalogueId: { in: catalogueIds },
                statusId: { in: RECORDING_UNDER_WAY },
            },
            select: {
                catalogueId: true,
                sentToReaderDate: true,
                readerHistory: {
                    orderBy: { assignedDate: 'desc' },
                    take: 1,
                    select: { reader: { select: { firstName: true, lastName: true } } },
                },
            },
            orderBy: { id: 'desc' },
        }),
        prisma.orders.findMany({
            where: { catalogueId: { in: catalogueIds }, ...RECORDING_DEMANDE_UNDER_WAY },
            select: { id: true, catalogueId: true },
            orderBy: { id: 'asc' },
        }),
    ]);

    // An attribution says more (who has the book) than its demande: it wins.
    // Most recent attribution, oldest demande, when a book somehow carries several.
    const byCatalogue = new Map<number, DuplicationWait>();
    for (const r of recordings) {
        if (byCatalogue.has(r.catalogueId)) continue;
        byCatalogue.set(r.catalogueId, {
            kind: 'lecteur',
            readerName: getUserNameOnly(r.readerHistory[0]?.reader ?? null) || null,
            sentToReaderDate: r.sentToReaderDate,
        });
    }
    for (const d of demandes) {
        if (byCatalogue.has(d.catalogueId)) continue;
        byCatalogue.set(d.catalogueId, { kind: 'demande', orderId: d.id });
    }

    const byOrder = new Map<number, DuplicationWait>();
    for (const o of waiting) {
        byOrder.set(o.id, byCatalogue.get(o.catalogueId) ?? { kind: 'aucun' });
    }
    return byOrder;
}

/** JSON-safe shape handed to client components. */
export type SerializedDuplicationWait =
    | { kind: 'lecteur'; readerName: string | null; sentToReaderDate: string | null }
    | { kind: 'demande'; orderId: number }
    | { kind: 'aucun' };

export function serializeBlockedDuplications(
    blocked: Map<number, DuplicationWait>
): Record<number, SerializedDuplicationWait> {
    return Object.fromEntries(
        [...blocked].map(([orderId, w]) => [
            orderId,
            w.kind === 'lecteur'
                ? { ...w, sentToReaderDate: w.sentToReaderDate ? w.sentToReaderDate.toISOString() : null }
                : w,
        ])
    );
}
