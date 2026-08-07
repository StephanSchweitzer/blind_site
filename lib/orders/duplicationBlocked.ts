import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { STATUS, type TransactionClient } from '@/lib/statusSync';

/**
 * A duplication is « À faire » — it's meant to be done straight away. The one
 * case where it can't be is when the book has no audio *yet* because a lecteur
 * is still recording it. That dependency is not modelled: a duplication owns no
 * attribution (see guardNotDuplication), so the only thing it shares with the
 * recording is the book. It is therefore derived on read, never stored — the
 * attribution reaching « Terminé » unblocks the duplication without anything
 * touching the demande, and a stored flag would silently go stale at exactly
 * that moment.
 */

/** Both statuses block: a book that hasn't gone out to a lecteur yet is just as unavailable. */
const RECORDING_UNDER_WAY = [STATUS.ATTENTE, STATUS.EN_COURS];

/** A closed demande waits for nothing — whatever the book is doing is no longer its problem. */
const DEMANDE_CLOSED: number[] = [STATUS.TERMINE, STATUS.SOLDE];

/**
 * Prisma filter for "this demande is a duplication that can't start yet".
 * Sits on `catalogue`, which the orders list leaves free (its search puts the
 * book conditions inside an OR instead).
 */
export const blockedDuplicationWhere: Prisma.OrdersWhereInput = {
    isDuplication: true,
    statusId: { notIn: DEMANDE_CLOSED },
    catalogue: {
        audio_filepath: null,
        assignments: { some: { statusId: { in: RECORDING_UNDER_WAY } } },
    },
};

/**
 * The open duplications of a book that were waiting on a recording which has
 * just come back — the mirror of the derivation above, taken at the moment the
 * block lifts rather than on read.
 *
 * This is the case that used to disappear silently. A demande d'enregistrement
 * comes in for a book; while the lecteur has it, a second auditeur asks for the
 * same book, so that second demande is a duplication with nothing to copy yet.
 * When the enregistrement finally comes back, the person finishing the
 * attribution is looking at the FIRST demande and has no reason to suspect the
 * second exists. Naming them at that exact moment is the only place the two
 * ever meet.
 *
 * Call inside the finishing transaction. `audio_filepath: null` is deliberate:
 * a book that already had audio was never blocked by this recording.
 */
export async function findDuplicationsFreedByRecording(
    tx: TransactionClient,
    catalogueId: number
): Promise<number[]> {
    const freed = await tx.orders.findMany({
        where: {
            isDuplication: true,
            catalogueId,
            statusId: { notIn: DEMANDE_CLOSED },
            catalogue: { audio_filepath: null },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
    });
    return freed.map((o) => o.id);
}

export type BlockingRecording = {
    readerName: string | null;
    sentToReaderDate: Date | null;
};

type OrderRowLike = {
    id: number;
    catalogueId: number;
    statusId: number;
    isDuplication: boolean;
    catalogue: { audio_filepath: string | null };
};

/**
 * Of the given demandes, which duplications are waiting on a recording — keyed
 * by demande id, carrying enough context to name the lecteur in the UI.
 *
 * One query for the whole page. Two things exclude a duplication before any
 * query runs: a book that *already* has audio (the copy can be made right now,
 * even if a re-reading happens to be under way), and a demande that is already
 * closed (a « Terminé » duplication is done — it waits for nothing).
 */
export async function findBlockedDuplications(
    orders: OrderRowLike[]
): Promise<Map<number, BlockingRecording>> {
    const waiting = orders.filter(
        (o) =>
            o.isDuplication &&
            !o.catalogue.audio_filepath &&
            !DEMANDE_CLOSED.includes(o.statusId)
    );
    if (waiting.length === 0) return new Map();

    const recordings = await prisma.assignment.findMany({
        where: {
            catalogueId: { in: [...new Set(waiting.map((o) => o.catalogueId))] },
            statusId: { in: RECORDING_UNDER_WAY },
        },
        select: {
            catalogueId: true,
            sentToReaderDate: true,
            readerHistory: {
                orderBy: { assignedDate: 'desc' },
                take: 1,
                select: { reader: { select: { name: true } } },
            },
        },
        orderBy: { id: 'desc' },
    });

    // Most recent attribution wins when a book somehow carries several.
    const byCatalogue = new Map<number, BlockingRecording>();
    for (const r of recordings) {
        if (byCatalogue.has(r.catalogueId)) continue;
        byCatalogue.set(r.catalogueId, {
            readerName: r.readerHistory[0]?.reader?.name ?? null,
            sentToReaderDate: r.sentToReaderDate,
        });
    }

    const byOrder = new Map<number, BlockingRecording>();
    for (const o of waiting) {
        const recording = byCatalogue.get(o.catalogueId);
        if (recording) byOrder.set(o.id, recording);
    }
    return byOrder;
}

/** JSON-safe shape handed to client components. */
export type SerializedBlockingRecording = {
    readerName: string | null;
    sentToReaderDate: string | null;
};

export function serializeBlockedDuplications(
    blocked: Map<number, BlockingRecording>
): Record<number, SerializedBlockingRecording> {
    return Object.fromEntries(
        [...blocked].map(([orderId, r]) => [
            orderId,
            {
                readerName: r.readerName,
                sentToReaderDate: r.sentToReaderDate ? r.sentToReaderDate.toISOString() : null,
            },
        ])
    );
}
