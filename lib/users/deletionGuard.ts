import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';
import { BillingStatus } from '@/lib/billing-enums';

/**
 * Counts of *active* relations that block deleting a user.
 *
 * "Active" means in-progress / not yet closed:
 * - affectations: the user is the LATEST reader on an assignment whose status
 *   is not Terminé/Soldé (a reader who has since been reassigned is NOT active).
 * - orders (as auditeur/aveugle): order is active and not Terminé/Soldé.
 * - bills (as client): bill is active and not finalized (state DRAFT or BILLED;
 *   PAID and SOLDE count as closed).
 *
 * Historical/closed relations do NOT block deletion — those users are
 * soft-deleted instead. Adjust the predicates here if the business rules shift.
 */
export interface UserDeletionBlockers {
    activeAffectations: number;
    activeOrders: number;
    activeBills: number;
    total: number;
}

/**
 * Active-affectation count per reader, computed from the LATEST AssignmentReader
 * row per assignment (a reader who has since been reassigned is NOT counted) on
 * assignments whose status is open (not Terminé/Soldé).
 *
 * Batched so a single call covers a whole search-result page (#3). Returns a Map
 * keyed by every id in `userIds` (0 when none active).
 */
export async function getActiveAssignmentCounts(
    userIds: number[]
): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    for (const id of userIds) counts.set(id, 0);
    if (userIds.length === 0) return counts;

    // Every assignment any of these users has ever been a reader on.
    const readerRows = await prisma.assignmentReader.findMany({
        where: { readerId: { in: userIds } },
        select: { assignmentId: true },
    });
    const assignmentIds = [...new Set(readerRows.map((r) => r.assignmentId))];
    if (assignmentIds.length === 0) return counts;

    // Latest reader per assignment + that assignment's status.
    const latestPerAssignment = await prisma.assignmentReader.findMany({
        where: { assignmentId: { in: assignmentIds } },
        orderBy: { assignedDate: 'desc' },
        distinct: ['assignmentId'],
        select: {
            readerId: true,
            assignment: { select: { status: { select: { name: true } } } },
        },
    });

    for (const l of latestPerAssignment) {
        if (l.readerId == null || !counts.has(l.readerId)) continue;
        const status = (l.assignment.status?.name ?? '').toLowerCase();
        const open = !status.includes('terminé') && !status.includes('soldé');
        if (open) counts.set(l.readerId, (counts.get(l.readerId) ?? 0) + 1);
    }
    return counts;
}

export async function getUserDeletionBlockers(userId: number): Promise<UserDeletionBlockers> {
    // Active affectations: latest reader per assignment === this user, status open.
    // Reuses the shared batched helper (single-id case) so the "active" rule lives
    // in one place (#3 reuses the same logic).
    const counts = await getActiveAssignmentCounts([userId]);
    const activeAffectations = counts.get(userId) ?? 0;

    const [activeOrders, activeBills] = await Promise.all([
        prisma.orders.count({
            where: {
                aveugleId: userId,
                isActive: true,
                statusId: { notIn: [STATUS.TERMINE, STATUS.SOLDE] },
            },
        }),
        prisma.bill.count({
            where: {
                clientId: userId,
                isActive: true,
                state: { in: [BillingStatus.DRAFT, BillingStatus.BILLED] },
            },
        }),
    ]);

    return {
        activeAffectations,
        activeOrders,
        activeBills,
        total: activeAffectations + activeOrders + activeBills,
    };
}

/** Human-readable French reason string for a 409 response. */
export function describeBlockers(b: UserDeletionBlockers): string {
    const parts: string[] = [];
    if (b.activeAffectations > 0)
        parts.push(`${b.activeAffectations} attribution(s) active(s)`);
    if (b.activeOrders > 0) parts.push(`${b.activeOrders} commande(s) active(s)`);
    if (b.activeBills > 0) parts.push(`${b.activeBills} facture(s) non soldée(s)`);
    const list = parts.join(', ');
    return `Suppression impossible : cette personne a ${list}. ` +
        `Clôturez-les (ou réattribuez les affectations) avant de la supprimer.`;
}
