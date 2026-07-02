import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { guardReaderEligible, guardCanReassignReader } from '@/lib/statusSync';
import { guardUserIsActive } from '@/lib/users/activityGuard';
import { DeliveryMethod } from '@prisma/client';

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
                { message: 'ID d\'attribution invalide' },
                { status: 400 }
            );
        }

        const assignment = await prisma.assignment.findUnique({
            where: { id: assignmentId },
            select: { id: true },
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Attribution non trouvée' },
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
    revalidateAdmin();
    try {
        const { id } = await params;
        const assignmentId = parseInt(id);

        if (isNaN(assignmentId)) {
            return NextResponse.json(
                { message: 'ID d\'attribution invalide' },
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
                deliveryMethod: true,
                catalogue: { select: { title: true, author: true } },
                _count: { select: { readerHistory: true } },
            },
        });

        if (!assignment) {
            return NextResponse.json(
                { message: 'Attribution non trouvée' },
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
            select: { id: true, memberType: true, preferredDeliveryMethod: true },
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

        // An inactive reader can't receive a (re)assignment — the admin must
        // reactivate them first (see lib/users/activityGuard.ts).
        const activityGuard = await guardUserIsActive(parseInt(readerId), 'lecteur');
        if (!activityGuard.ok) {
            return NextResponse.json(
                { message: activityGuard.message, blocked: activityGuard.blocked },
                { status: activityGuard.httpStatus }
            );
        }

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

        // The attribution's delivery method is an explicit per-attribution value:
        // never overwrite an existing one on reassignment. Only seed it (from the
        // new reader's profile preference) when it hasn't been set yet.
        let effectiveDelivery: DeliveryMethod | null = assignment.deliveryMethod ?? null;
        if (effectiveDelivery === null && reader.preferredDeliveryMethod) {
            effectiveDelivery = reader.preferredDeliveryMethod;
            await prisma.assignment.update({
                where: { id: assignmentId },
                data: { deliveryMethod: effectiveDelivery },
            });
        }

        return NextResponse.json({
            message: 'Lecteur assigné avec succès',
            assignmentReader,
        }, { status: 201 });
    } catch (error) {
        console.error('Error assigning reader:', error);
        return NextResponse.json(
            { message: 'Erreur lors de l\'attribution du lecteur' },
            { status: 500 }
        );
    }
}