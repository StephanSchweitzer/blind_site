import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    AssignmentUpdateInputSchema,
    AssignmentUpdateData,
    assignmentIncludeConfigs,
} from '@/types/api/assignment.types';

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
        const updateData: AssignmentUpdateData = {
            ...(validation.data.readerId !== undefined && { readerId: validation.data.readerId }),
            ...(validation.data.catalogueId !== undefined && { catalogueId: validation.data.catalogueId }),
            ...(validation.data.statusId !== undefined && { statusId: validation.data.statusId }),
            ...(validation.data.orderId !== undefined && { orderId: validation.data.orderId }),
            ...(validation.data.receptionDate !== undefined && {
                receptionDate: validation.data.receptionDate ? new Date(validation.data.receptionDate) : null
            }),
            ...(validation.data.sentToReaderDate !== undefined && {
                sentToReaderDate: validation.data.sentToReaderDate ? new Date(validation.data.sentToReaderDate) : null
            }),
            ...(validation.data.returnedToECADate !== undefined && {
                returnedToECADate: validation.data.returnedToECADate ? new Date(validation.data.returnedToECADate) : null
            }),
            ...(validation.data.notes !== undefined && { notes: validation.data.notes }),
            ...(validation.data.processedByStaffId !== undefined && { processedByStaffId: validation.data.processedByStaffId }),
        };

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
        });
    } catch (error) {
        console.error('Error deleting assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de l\'affectation' },
            { status: 500 }
        );
    }
}