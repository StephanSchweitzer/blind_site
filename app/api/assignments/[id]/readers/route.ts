import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { STATUS, guardReaderEligible, guardCanReassignReader } from '@/lib/statusSync';
import { sendAssignmentReminder } from '@/lib/email/sendAssignmentReminder';
import type { ReminderVariant } from '@/components/emails/AssignmentReminderEmail';

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
 * Creates a new AssignmentReader entry, maintaining history of all assignments.
 * Does not change any workflow status (status is managed on the assignment itself).
 *
 * Notification variant by current state:
 *  - no prior reader            -> 'assigned'            (pending send)
 *  - prior reader, ATTENTE      -> 'reassigned_pending'  (pending send)
 *  - prior reader, EN_COURS     -> 'reassigned_active'   (book mid-reading, forwarded)
 * The date shown is this reader's AssignmentReader.assignedDate. The 'sent' email
 * (with sentToReaderDate) is owned by the EN_COURS transition in PUT /api/assignments/[id].
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

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: {
                id: true,
                statusId: true,
                catalogue: { select: { title: true, author: true } },
                _count: { select: { readerHistory: true } },
            },
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Affectation non trouvée' },
                { status: 404 }
            );
        }

        // A finished assignment is locked: reopen it before assigning a new reader.
        const reassignGuard = guardCanReassignReader(assignment.statusId);
        if (!reassignGuard.ok) {
            return NextResponse.json(
                { message: reassignGuard.message },
                { status: reassignGuard.httpStatus }
            );
        }

        const reader = await prisma.user.findUnique({
            where: { id: parseInt(readerId) },
            select: { id: true, memberType: true },
        });

        if (!reader) {
            return NextResponse.json(
                { message: 'Lecteur non trouvé' },
                { status: 404 }
            );
        }

        const readerGuard = guardReaderEligible(reader.memberType as string | null);
        if (!readerGuard.ok) {
            return NextResponse.json(
                { message: readerGuard.message },
                { status: readerGuard.httpStatus }
            );
        }

        const isReassignment = assignment._count.readerHistory > 0;
        const variant: ReminderVariant = !isReassignment
            ? 'assigned'
            : assignment.statusId === STATUS.EN_COURS
                ? 'reassigned_active'
                : 'reassigned_pending';

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

        if (assignment.catalogue) {
            await sendAssignmentReminder({
                reader: assignmentReader.reader,
                book: {
                    title: assignment.catalogue.title,
                    author: assignment.catalogue.author,
                },
                assignmentId,
                date: assignmentReader.assignedDate,
                variant,
            });
        }

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