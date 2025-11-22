// app/api/assignments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

        // Validate required fields
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

        // Create assignment and optionally the first reader assignment in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Create the assignment
            const assignment = await tx.assignment.create({
                data: {
                    catalogueId: parseInt(catalogueId),
                    orderId: orderId ? parseInt(orderId) : null,
                    receptionDate: receptionDate ? new Date(receptionDate) : null,
                    sentToReaderDate: sentToReaderDate ? new Date(sentToReaderDate) : null,
                    returnedToECADate: returnedToECADate ? new Date(returnedToECADate) : null,
                    statusId: parseInt(statusId),
                    notes: notes || null,
                },
            });

            // If a reader is provided, create the initial reader assignment
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

            // Fetch the complete assignment with relations
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