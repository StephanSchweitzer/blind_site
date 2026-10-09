import { prisma } from '@/lib/prisma';
import { getUserDisplayName } from '@/lib/users/displayName';

/**
 * The attribution linked to a demande (or null), in the shape the demande form
 * reads (`OrderAssignment` in OrderFormBackendBase). A demande is effectively
 * one-to-one with its attribution; if several ever exist the latest wins. The
 * reader is the current one (most recent entry in the reader history).
 *
 * Served by GET /api/orders/[id]?include=assignment, so the edit form has it
 * at mount: it derives the statut from it, and an answer arriving after the
 * form is interactive would be read as "no attribution" in the meantime.
 */
export async function getOrderLinkedAssignment(orderId: number) {
    const a = await prisma.assignment.findFirst({
        where: { orderId },
        orderBy: { id: 'desc' },
        select: {
            id: true,
            statusId: true,
            sentToReaderDate: true,
            returnedToECADate: true,
            status: { select: { name: true } },
            readerHistory: {
                orderBy: { assignedDate: 'desc' },
                take: 1,
                select: {
                    reader: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                },
            },
        },
    });

    if (!a) return null;

    const r = a.readerHistory[0]?.reader ?? null;

    return {
        id: a.id,
        statusId: a.statusId,
        statusName: a.status.name,
        reader: r ? { id: r.id, name: getUserDisplayName(r) } : null,
        sentToReaderDate: a.sentToReaderDate,
        returnedToECADate: a.returnedToECADate,
    };
}
