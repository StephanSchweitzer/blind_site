import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    AssignmentUpdateInputSchema,
    AssignmentUpdateData,
} from '@/types/api';
import { assignmentIncludeConfigs } from '@/types/models';

/**
 * GET /api/assignments/[id] - Get a single assignment by ID
 *
 * Returns assignment with all relations including reader history.
 * Reader assignments are tracked through the AssignmentReader table.
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
 * PUT /api/assignments/[id] - Update an assignment
 *
 * Note: Reader assignments are managed through the AssignmentReader table.
 * To assign/reassign a reader, use POST /api/assignments/[id]/readers
 * This maintains a complete history of all reader assignments.
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

        // Validate input with Zod
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
            select: { id: true },
        });

        if (!existingAssignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        // Build update data with proper type conversion
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
            updateData.receptionDate = validation.data.receptionDate
        }
        if (validation.data.sentToReaderDate !== undefined) {
            updateData.sentToReaderDate = validation.data.sentToReaderDate
        }
        if (validation.data.returnedToECADate !== undefined) {
            updateData.returnedToECADate = validation.data.returnedToECADate
        }
        if (validation.data.notes !== undefined) {
            updateData.notes = validation.data.notes;
        }
        if (validation.data.processedByStaffId !== undefined) {
            updateData.processedByStaffId = validation.data.processedByStaffId;
        }

        const updatedAssignment = await prisma.assignment.update({
            where: { id: assignmentId },
            data: updateData,
            include: assignmentIncludeConfigs.all,
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
 * DELETE /api/assignments/[id] - Delete an assignment
 *
 * Cascading delete: All related AssignmentReader records will be automatically deleted.
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

        // Delete assignment (cascades to AssignmentReader records)
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