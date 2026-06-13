import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    AssignmentUpdateInputSchema,
    AssignmentUpdateData,
} from '@/types/api';
import { assignmentIncludeConfigs } from '@/types/models';
import {
    guardAssignmentStatus,
    guardAssignmentConsistency,
    guardAssignmentMatchesOrder,
    guardOrderNotSettled,
    syncOrderToStatus,
} from '@/lib/statusSync';

/**
 * GET /api/assignments/[id] - Get a single assignment by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const assignmentId = parseInt(id);

        if (isNaN(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'affectation invalide' },
                { status: 400 }
            );
        }

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            include: assignmentIncludeConfigs.all,
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        return NextResponse.json(assignment);
    } catch (error) {
        console.error('Error fetching assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de l\'affectation' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/assignments/[id] - Update an assignment.
 * A status change (1–3) propagates up to the linked order.
 * Reader assignments are managed via POST /api/assignments/[id]/readers.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const assignmentId = parseInt(id);

        if (isNaN(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'affectation invalide' },
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
                sentToReaderDate: true,
                returnedToECADate: true,
                order: { select: { statusId: true } },
                _count: { select: { readerHistory: true } },
            },
        });

        if (!existingAssignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
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

        const updatedAssignment = await prisma.$transaction(async (tx) => {
            const assignment = await tx.assignment.update({
                where: { id: assignmentId },
                data: updateData,
                include: assignmentIncludeConfigs.all,
            });

            // Propagate the new status (1–3) up to the linked order.
            if (
                newStatusId !== undefined &&
                existingAssignment.orderId &&
                newStatusId !== existingAssignment.statusId
            ) {
                await syncOrderToStatus(tx, existingAssignment.orderId, newStatusId);
            }

            return assignment;
        });

        return NextResponse.json({
            message: 'Affectation mise à jour avec succès',
            assignment: updatedAssignment,
        });
    } catch (error) {
        console.error('Error updating assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de l\'affectation' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/assignments/[id] - Delete an assignment.
 * Cascading delete removes related AssignmentReader records.
 * The linked order keeps its current status and becomes freely editable again.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const assignmentId = parseInt(id);

        if (isNaN(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'affectation invalide' },
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
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        await prisma.assignment.delete({
            where: { id: assignmentId },
        });

        return NextResponse.json({
            message: 'Affectation supprimée avec succès',
            deletedId: assignmentId,
            deletedReaderHistoryCount: existingAssignment._count.readerHistory,
        });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de l\'affectation' },
            { status: 500 }
        );
    }
}