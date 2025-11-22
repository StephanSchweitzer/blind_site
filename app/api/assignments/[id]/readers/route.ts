import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/assignments/[id]/readers - Get reader history for an assignment
 * Returns all reader assignments ordered by most recent first
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

        // Check if assignment exists
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: { id: true },
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        // Fetch reader history ordered by most recent first
        const readerHistory = await prisma.assignmentReader.findMany({
            where: { assignmentId },
            include: {
                reader: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
            orderBy: {
                assignedDate: 'desc',
            },
        });

        return NextResponse.json(readerHistory);
    } catch (error) {
        console.error('Error fetching reader history:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de l\'historique des lecteurs' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/assignments/[id]/readers - Assign or reassign a reader to an assignment
 * Creates a new AssignmentReader entry, maintaining history of all assignments
 */
export async function POST(
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
        const { readerId, notes } = body;

        if (!readerId) {
            return NextResponse.json(
                { message: 'Le lecteur est requis' },
                { status: 400 }
            );
        }

        // Check if assignment exists
        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: { id: true },
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        // Check if reader exists
        const reader = await prisma.user.findUnique({
            where: { id: parseInt(readerId) },
            select: { id: true },
        });

        if (!reader) {
            return NextResponse.json(
                { message: 'Lecteur non trouvé' },
                { status: 404 }
            );
        }

        // Create the new reader assignment
        const assignmentReader = await prisma.assignmentReader.create({
            data: {
                assignmentId,
                readerId: parseInt(readerId),
                assignedDate: new Date(),
                notes: notes || null,
            },
            include: {
                reader: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                    },
                },
            },
        });

        return NextResponse.json({
            message: 'Lecteur assigné avec succès',
            assignmentReader,
        }, { status: 201 });
    } catch (error) {
        console.error('Error assigning reader:', error);
        return NextResponse.json(
            { message: 'Erreur lors de l\'assignation du lecteur' },
            { status: 500 }
        );
    }
}