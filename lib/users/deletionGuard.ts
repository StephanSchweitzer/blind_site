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
 * Is an attribution still open — i.e. does it count against its reader's
 * charge? Matched on the status NAME (statuses are a table, not an enum), and
 * exported so every "en cours" reading in the app agrees: the deletion
 * blockers, the availability counts, and the attribution list of the
 * disponibilités panel.
 */
export function isOpenAssignmentStatusName(name: string | null | undefined): boolean {
    const status = (name ?? '').toLowerCase();
    return !status.includes('terminé') && !status.includes('soldé');
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
    //
    // `assignment: { deletedAt: null }` explicitement : AssignmentReader n'est pas
    // un modèle soft-delete, ses lignes SURVIVENT à la suppression de leur
    // attribution (c'est le but — l'historique de qui a tenu quel livre), et un
    // filtre sur une relation échappe de toute façon au filtre global de
    // lib/prisma.ts. Sans ça, une attribution supprimée continuait de compter dans
    // la charge d'un lecteur : le badge « 3 / 4 » de /admin/disponibilites la
    // comptait encore, et getUserDeletionBlockers refusait de supprimer la
    // personne au nom d'une attribution qui n'existe plus.
    const readerRows = await prisma.assignmentReader.findMany({
        where: { readerId: { in: userIds }, assignment: { deletedAt: null } },
        select: { assignmentId: true },
    });
    const assignmentIds = [...new Set(readerRows.map((r) => r.assignmentId))];
    if (assignmentIds.length === 0) return counts;

    // Latest reader per assignment + that assignment's status.
    const latestPerAssignment = await prisma.assignmentReader.findMany({
        where: { assignmentId: { in: assignmentIds }, assignment: { deletedAt: null } },
        orderBy: { assignedDate: 'desc' },
        distinct: ['assignmentId'],
        select: {
            readerId: true,
            assignment: { select: { status: { select: { name: true } } } },
        },
    });

    for (const l of latestPerAssignment) {
        if (l.readerId == null || !counts.has(l.readerId)) continue;
        if (isOpenAssignmentStatusName(l.assignment.status?.name)) {
            counts.set(l.readerId, (counts.get(l.readerId) ?? 0) + 1);
        }
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
    if (b.activeOrders > 0) parts.push(`${b.activeOrders} demande(s) active(s)`);
    if (b.activeBills > 0) parts.push(`${b.activeBills} facture(s) non soldée(s)`);
    const list = parts.join(', ');
    return `Suppression impossible : cette personne a ${list}. ` +
        `Clôturez-les (ou réattribuez les attributions) avant de la supprimer.`;
}
