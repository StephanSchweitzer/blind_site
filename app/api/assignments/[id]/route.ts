import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import {
    AssignmentUpdateInputSchema,
    AssignmentUpdateData,
} from '@/types/api';
import { assignmentIncludeConfigs } from '@/types/models';
import {
    STATUS,
    guardAssignmentStatus,
    guardAssignmentConsistency,
    guardAssignmentDateSequence,
    guardAssignmentMatchesOrder,
    guardOrderNotSettled,
    guardAssignmentHasAudio,
    syncOrderToStatus,
    assignmentKeepsOrderStatus,
    orderStatusForAssignmentStatus,
    classifyStatusTransition,
    logAssignmentEvent,
} from '@/lib/statusSync';
import { bookHasWeighedAudio } from '@/lib/audio/state';
import { findDuplicationsFreedByRecording } from '@/lib/orders/duplicationBlocked';
import { withAdmin } from '@/lib/auth/guards';
import {
    guardOrderLeavingTermineOnBill,
    leavesTermine,
    detachOrderFromBill,
} from '@/lib/billing';

/**
 * GET /api/assignments/[id] - Get a single assignment by ID
 */
export const GET = withAdmin(async (_request, { params }) => {
    try {
        const { id } = (await params) ?? {};
        const assignmentId = Number(id);

        if (!Number.isInteger(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'attribution invalide' },
                { status: 400 }
            );
        }

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: assignmentIncludeConfigs.all,
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Attribution non trouvée' },
                { status: 404 }
            );
        }

        return NextResponse.json(assignment);
    } catch (error) {
        console.error('Error fetching assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de l\'attribution' },
            { status: 500 }
        );
    }
});

/**
 * PUT /api/assignments/[id] - Update an assignment.
 * A status change (1–3) propagates up to the linked order.
 * Reader assignments are managed via POST /api/assignments/[id]/readers.
 */
export const PUT = withAdmin(async (request, { me, params }) => {
    revalidateAdmin();
    try {
        const performedById = me.id;

        const { id } = (await params) ?? {};
        const assignmentId = Number(id);

        if (!Number.isInteger(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'attribution invalide' },
                { status: 400 }
            );
        }

        const body = await request.json();

        const validation = AssignmentUpdateInputSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                {
                    message: 'Données invalides',
                    errors: validation.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        const existingAssignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: {
                id: true,
                statusId: true,
                catalogueId: true,
                orderId: true,
                receptionDate: true,
                sentToReaderDate: true,
                returnedToECADate: true,
                order: { select: { statusId: true, billId: true, bill: { select: { state: true } } } },
                _count: { select: { readerHistory: true } },
            },
        });

        if (!existingAssignment) {
            return NextResponse.json(
                { message: 'Attribution non trouvée' },
                { status: 404 }
            );
        }

        // A settled order locks its assignment entirely.
        const settledGuard = guardOrderNotSettled(
            existingAssignment.order?.statusId ?? null
        );
        if (!settledGuard.ok) {
            return NextResponse.json(
                { message: settledGuard.message },
                { status: settledGuard.httpStatus }
            );
        }

        const newStatusId = validation.data.statusId;

        // ── La demande rattachée à une facture, vue depuis l'attribution ─────────
        // Rouvrir une attribution rouvre sa demande (syncOrderToStatus). Si cette
        // demande est déjà partie sur une facture, c'est la même règle que sur son
        // propre formulaire — sinon la porte de derrière annule le verrou de devant :
        // refusé sur une facture émise, détachement automatique sur un brouillon.
        const linkedOrderStatusId = existingAssignment.order?.statusId ?? null;
        const linkedOrderBillId = existingAssignment.order?.billId ?? null;
        const linkedOrderBillState = existingAssignment.order?.bill?.state ?? null;
        const nextOrderStatusId =
            newStatusId !== undefined && linkedOrderStatusId != null &&
            !assignmentKeepsOrderStatus(linkedOrderStatusId, newStatusId)
                ? orderStatusForAssignmentStatus(newStatusId)
                : linkedOrderStatusId;

        if (linkedOrderStatusId != null && nextOrderStatusId != null) {
            const orderRollbackGuard = guardOrderLeavingTermineOnBill({
                previousStatusId: linkedOrderStatusId,
                nextStatusId: nextOrderStatusId,
                billId: linkedOrderBillId,
                billState: linkedOrderBillState,
            });
            if (!orderRollbackGuard.ok) {
                return NextResponse.json(
                    { message: orderRollbackGuard.message },
                    { status: orderRollbackGuard.httpStatus }
                );
            }
        }

        const detachOrderFromDraft =
            linkedOrderBillId != null &&
            linkedOrderBillState === 'DRAFT' &&
            linkedOrderStatusId != null &&
            nextOrderStatusId != null &&
            leavesTermine(linkedOrderStatusId, nextOrderStatusId);

        // An assignment can never hold the SOLDE status.
        if (newStatusId !== undefined) {
            const statusGuard = guardAssignmentStatus(newStatusId);
            if (!statusGuard.ok) {
                return NextResponse.json(
                    { message: statusGuard.message },
                    { status: statusGuard.httpStatus }
                );
            }
        }

        // Validate the RESULTING assignment (existing values merged with this update)
        // against the reader/date <-> status rules.
        const resultingStatusId = newStatusId ?? existingAssignment.statusId;
        const resultingSentDate = validation.data.sentToReaderDate !== undefined
            ? validation.data.sentToReaderDate
            : existingAssignment.sentToReaderDate;
        const resultingReturnDate = validation.data.returnedToECADate !== undefined
            ? validation.data.returnedToECADate
            : existingAssignment.returnedToECADate;

        const consistencyGuard = guardAssignmentConsistency({
            statusId: resultingStatusId,
            hasReader: existingAssignment._count.readerHistory > 0,
            sentToReaderDate: resultingSentDate,
            returnedToECADate: resultingReturnDate,
        });
        if (!consistencyGuard.ok) {
            return NextResponse.json(
                { message: consistencyGuard.message },
                { status: consistencyGuard.httpStatus }
            );
        }

        // Réception → envoi → retour. Grandfathered against the record's own
        // previous dates, so resaving an already-inconsistent legacy row
        // (imported without a date de réception) unchanged keeps working — only
        // a date genuinely new in THIS request is checked against its prerequisite.
        const resultingReceptionDate = validation.data.receptionDate !== undefined
            ? validation.data.receptionDate
            : existingAssignment.receptionDate;
        const dateSequenceGuard = guardAssignmentDateSequence({
            receptionDate: resultingReceptionDate,
            sentToReaderDate: resultingSentDate,
            returnedToECADate: resultingReturnDate,
            previousSentToReaderDate: existingAssignment.sentToReaderDate,
            previousReturnedToECADate: existingAssignment.returnedToECADate,
        });
        if (!dateSequenceGuard.ok) {
            return NextResponse.json(
                { message: dateSequenceGuard.message },
                { status: dateSequenceGuard.httpStatus }
            );
        }

        // If still linked to an order, the resulting book must match that order's book.
        const resultingCatalogueId = validation.data.catalogueId ?? existingAssignment.catalogueId;
        const resultingOrderId = validation.data.orderId !== undefined
            ? validation.data.orderId
            : existingAssignment.orderId;
        if (resultingOrderId) {
            const linkedOrder = await prisma.orders.findUnique({
                where: { id: resultingOrderId },
                select: { catalogueId: true },
            });
            if (linkedOrder) {
                const bookGuard = guardAssignmentMatchesOrder(resultingCatalogueId, linkedOrder.catalogueId);
                if (!bookGuard.ok) {
                    return NextResponse.json(
                        { message: bookGuard.message },
                        { status: bookGuard.httpStatus }
                    );
                }
            }
        }

        // An attribution can't be finished before the enregistrement is in the
        // bucket AND weighed — the tarif is derived from that poids, and closing
        // the demande behind it is what puts the line on a brouillon.
        //
        // Only on the actual transition INTO « Terminé ». An attribution already
        // sitting there stays editable for its notes and ses dates even if the
        // folder is empty (legacy Access rows, audio archived elsewhere) — same
        // rule as guardDuplicationStatus: a real change must land on a valid state,
        // a row must not be held hostage by its history. Outside the transaction:
        // bookHasWeighedAudio may reach the bucket.
        if (
            newStatusId === STATUS.TERMINE &&
            newStatusId !== existingAssignment.statusId
        ) {
            const audioGuard = guardAssignmentHasAudio({
                statusId: newStatusId,
                hasAudio: await bookHasWeighedAudio(resultingCatalogueId, performedById),
            });
            if (!audioGuard.ok) {
                return NextResponse.json(
                    { message: audioGuard.message },
                    { status: audioGuard.httpStatus }
                );
            }
        }

        const updateData: AssignmentUpdateData = {};

        if (validation.data.catalogueId !== undefined) {
            updateData.catalogueId = validation.data.catalogueId;
        }
        if (validation.data.orderId !== undefined) {
            updateData.orderId = validation.data.orderId;
        }
        if (validation.data.statusId !== undefined) {
            updateData.statusId = validation.data.statusId;
        }
        if (validation.data.receptionDate !== undefined) {
            updateData.receptionDate = validation.data.receptionDate ? new Date(validation.data.receptionDate) : null;
        }
        if (validation.data.sentToReaderDate !== undefined) {
            updateData.sentToReaderDate = validation.data.sentToReaderDate ? new Date(validation.data.sentToReaderDate) : null;
        }
        if (validation.data.returnedToECADate !== undefined) {
            updateData.returnedToECADate = validation.data.returnedToECADate ? new Date(validation.data.returnedToECADate) : null;
        }
        if (validation.data.notes !== undefined) {
            updateData.notes = validation.data.notes;
        }
        if (validation.data.processedByStaffId !== undefined) {
            updateData.processedByStaffId = validation.data.processedByStaffId;
        }
        if (validation.data.deliveryMethod !== undefined) {
            updateData.deliveryMethod = validation.data.deliveryMethod;
        }

        const { assignment: updatedAssignment, orderTransition, billDetached } = await prisma.$transaction(async (tx) => {
            // What finishing this attribution did to the demande — reported back so
            // the toast can say it out loud instead of leaving it to be discovered.
            let orderTransition: {
                orderId: number;
                /** Demande now « Attente envoi vers auditeur »: enregistrement revenu, pas encore expédié. */
                awaitingShipment: boolean;
                /** Open duplications of the same book that were waiting on this recording. */
                freedDuplicationIds: number[];
            } | null = null;

            // Renseigné quand la réouverture a sorti la demande d'un brouillon.
            let billDetached: { orderId: number; billId: number; newTotal: string } | null = null;

            const assignment = await tx.assignment.update({
                where: { id: assignmentId },
                data: updateData,
                include: assignmentIncludeConfigs.all,
            });

            // Track the attribution's own processing history — creation is logged
            // where the assignment is created; this is every status transition
            // after that, made directly here.
            if (newStatusId !== undefined && newStatusId !== existingAssignment.statusId) {
                await logAssignmentEvent(tx, {
                    assignmentId,
                    type: classifyStatusTransition(existingAssignment.statusId, newStatusId),
                    fromStatusId: existingAssignment.statusId,
                    toStatusId: newStatusId,
                    performedById,
                });
            }

            // Propagate the new status up to the linked order. « Terminé » tops the
            // demande out at « Attente envoi vers auditeur » — the enregistrement is
            // back at ECA, which is not the same thing as the auditeur having it.
            // See orderStatusForAssignmentStatus.
            if (
                newStatusId !== undefined &&
                existingAssignment.orderId &&
                newStatusId !== existingAssignment.statusId
            ) {
                await syncOrderToStatus(tx, existingAssignment.orderId, newStatusId, performedById);

                // La demande vient de quitter « Terminé » : elle quitte donc le
                // brouillon qu'elle n'avait rejoint qu'en l'atteignant. Même geste
                // que sur le formulaire de la demande — une seule règle, deux portes.
                if (detachOrderFromDraft && linkedOrderBillId != null) {
                    const total = await detachOrderFromBill(tx, {
                        orderId: existingAssignment.orderId,
                        billId: linkedOrderBillId,
                        reason: 'assignment-status-rollback',
                        performedById,
                    });
                    billDetached = {
                        orderId: existingAssignment.orderId,
                        billId: linkedOrderBillId,
                        newTotal: total.toString(),
                    };
                }

                // The recording just finished — but that does NOT bill anything. The
                // demande is now « Attente envoi vers auditeur »; it accrues onto a
                // brouillon when a permanent closes it, having actually sent the audio
                // out. Deliberate: accruing here would attach a tarif computed before
                // the enregistrement was weighed, and the seuil could turn it into a
                // facture émise in this very transaction — past the point where
                // repriceOpenOrdersForBook is still allowed to correct it.
                if (newStatusId === STATUS.TERMINE) {
                    const order = await tx.orders.findUnique({
                        where: { id: existingAssignment.orderId },
                        select: { id: true, statusId: true },
                    });

                    if (order) {
                        orderTransition = {
                            orderId: order.id,
                            awaitingShipment: order.statusId === STATUS.ATTENTE_AUDITEUR,
                            freedDuplicationIds: await findDuplicationsFreedByRecording(
                                tx,
                                existingAssignment.catalogueId
                            ),
                        };
                    }
                }
            }

            return { assignment, orderTransition, billDetached };
        });

        return NextResponse.json({
            message: 'Attribution mise à jour avec succès',
            assignment: updatedAssignment,
            orderTransition,
            billDetached,
        });
    } catch (error) {
        console.error('Error updating assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de l\'attribution' },
            { status: 500 }
        );
    }
});

/**
 * DELETE /api/assignments/[id] - Delete an assignment.
 * Cascading delete removes related AssignmentReader records.
 * The linked order keeps its current status and becomes freely editable again.
 */
export const DELETE = withAdmin(async (_request, { params }) => {
    revalidateAdmin();
    try {
        const { id } = (await params) ?? {};
        const assignmentId = Number(id);

        if (!Number.isInteger(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'attribution invalide' },
                { status: 400 }
            );
        }

        const existingAssignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: {
                id: true,
                _count: {
                    select: {
                        readerHistory: true,
                    },
                },
            },
        });

        if (!existingAssignment) {
            return NextResponse.json(
                { message: 'Attribution non trouvée' },
                { status: 404 }
            );
        }

        await prisma.assignment.delete({
            where: { id: assignmentId },
        });

        return NextResponse.json({
            message: 'Attribution supprimée avec succès',
            deletedId: assignmentId,
            deletedReaderHistoryCount: existingAssignment._count.readerHistory,
        });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de l\'attribution' },
            { status: 500 }
        );
    }
});