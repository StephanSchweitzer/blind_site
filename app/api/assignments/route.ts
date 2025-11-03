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
                    reader: true,
                    catalogue: true,
                    order: true,
                    status: true,
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
                reader: true,
                catalogue: true,
                order: true,
                status: true,
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

        if (!readerId) {
            return NextResponse.json(
                { error: 'Le lecteur est requis' },
                { status: 400 }
            );
        }

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

        const assignment = await prisma.assignment.create({
            data: {
                readerId: parseInt(readerId),
                catalogueId: parseInt(catalogueId),
                orderId: orderId ? parseInt(orderId) : null,
                receptionDate: receptionDate ? new Date(receptionDate) : null,
                sentToReaderDate: sentToReaderDate ? new Date(sentToReaderDate) : null,
                returnedToECADate: returnedToECADate ? new Date(returnedToECADate) : null,
                statusId: parseInt(statusId),
                notes: notes || null,
            },
            include: {
                reader: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
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
            },
        });

        return NextResponse.json(assignment, { status: 201 });
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
