// app/api/assignments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    guardAssignmentStatus,
    guardNotDuplication,
    guardOrderHasNoAssignment,
    syncOrderToStatus,
} from '@/lib/statusSync';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (id) {
            const assignment = await prisma.assignment.findUnique({
                where: { id: parseInt(id) },
                include: {
                    catalogue: true,
                    order: true,
                    status: true,
                    readerHistory: {
                        orderBy: {
                            assignedDate: 'desc',
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
                    },
                },
            });

            if (!assignment) {
                return NextResponse.json(
                    { error: 'Assignment not found' },
                    { status: 404 }
                );
            }

            return NextResponse.json(assignment);
        }

        const assignments = await prisma.assignment.findMany({
            include: {
                catalogue: true,
                order: true,
                status: true,
                readerHistory: {
                    orderBy: {
                        assignedDate: 'desc',
                    },
                    take: 1, // Just get the current reader
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
                },
            },
            orderBy: { id: 'desc' },
        });

        return NextResponse.json(assignments);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assignments' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            readerId,
            catalogueId,
            orderId,
            receptionDate,
            sentToReaderDate,
            returnedToECADate,
            statusId,
            notes,
        } = body;

        if (!catalogueId) {
            return NextResponse.json(
                { error: 'Le livre du catalogue est requis' },
                { status: 400 }
            );
        }

        if (!statusId) {
            return NextResponse.json(
                { error: 'Le statut est requis' },
                { status: 400 }
            );
        }

        const parsedStatusId = parseInt(statusId);

        // An assignment can never be created with the SOLDE status.
        const statusGuard = guardAssignmentStatus(parsedStatusId);
        if (!statusGuard.ok) {
            return NextResponse.json(
                { error: statusGuard.message },
                { status: statusGuard.httpStatus }
            );
        }

        const parsedOrderId = orderId ? parseInt(orderId) : null;

        // Order-linked checks: order exists, not a duplication, and has no assignment yet.
        if (parsedOrderId) {
            const order = await prisma.orders.findUnique({
                where: { id: parsedOrderId },
                select: {
                    id: true,
                    isDuplication: true,
                    _count: { select: { assignments: true } },
                },
            });

            if (!order) {
                return NextResponse.json(
                    { error: 'Commande non trouvée' },
                    { status: 404 }
                );
            }

            const dupGuard = guardNotDuplication(order.isDuplication);
            if (!dupGuard.ok) {
                return NextResponse.json(
                    { error: dupGuard.message },
                    { status: dupGuard.httpStatus }
                );
            }

            const oneToOneGuard = guardOrderHasNoAssignment(order._count.assignments);
            if (!oneToOneGuard.ok) {
                return NextResponse.json(
                    { error: oneToOneGuard.message },
                    { status: oneToOneGuard.httpStatus }
                );
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            const assignment = await tx.assignment.create({
                data: {
                    catalogueId: parseInt(catalogueId),
                    orderId: parsedOrderId,
                    receptionDate: receptionDate ? new Date(receptionDate) : null,
                    sentToReaderDate: sentToReaderDate ? new Date(sentToReaderDate) : null,
                    returnedToECADate: returnedToECADate ? new Date(returnedToECADate) : null,
                    statusId: parsedStatusId,
                    notes: notes || null,
                },
            });

            // Align the linked order to the new assignment's status.
            if (parsedOrderId) {
                await syncOrderToStatus(tx, parsedOrderId, parsedStatusId);
            }

            if (readerId) {
                await tx.assignmentReader.create({
                    data: {
                        assignmentId: assignment.id,
                        readerId: parseInt(readerId),
                        assignedDate: new Date(),
                        notes: 'Affectation initiale',
                    },
                });
            }

            const completeAssignment = await tx.assignment.findUnique({
                where: { id: assignment.id },
                include: {
                    catalogue: {
                        select: {
                            id: true,
                            title: true,
                            author: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                        },
                    },
                    status: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    readerHistory: {
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
                    },
                },
            });

            return completeAssignment;
        });

        return NextResponse.json({ assignment: result }, { status: 201 });
    } catch (error) {
        console.error('Error creating assignment:', error);
        return NextResponse.json(
            {
                error: 'Échec de création de l\'affectation',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}