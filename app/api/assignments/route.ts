// app/api/assignments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import {
    STATUS,
    guardAssignmentStatus,
    guardAssignmentConsistency,
    guardAssignmentMatchesOrder,
    guardNotDuplication,
    guardOrderHasNoAssignment,
    guardReaderEligible,
    syncOrderToStatus,
} from '@/lib/statusSync';
import { sendAssignmentReminder } from '@/lib/email/sendAssignmentReminder';
import { guardUserIsActive } from '@/lib/users/activityGuard';
import { DeliveryMethod } from '@prisma/client';

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
    revalidateAdmin();
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
            deliveryMethod,
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

        // Reader/date <-> status consistency (a reader is the optional initial readerId).
        const consistencyGuard = guardAssignmentConsistency({
            statusId: parsedStatusId,
            hasReader: !!readerId,
            sentToReaderDate,
            returnedToECADate,
        });
        if (!consistencyGuard.ok) {
            return NextResponse.json(
                { error: consistencyGuard.message },
                { status: consistencyGuard.httpStatus }
            );
        }

        const parsedOrderId = orderId ? parseInt(orderId) : null;
        const parsedCatalogueId = parseInt(catalogueId);

        // Order-linked checks: order exists, not a duplication, has no assignment, and is for the same book.
        if (parsedOrderId) {
            const order = await prisma.orders.findUnique({
                where: { id: parsedOrderId },
                select: {
                    id: true,
                    isDuplication: true,
                    catalogueId: true,
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

            const bookGuard = guardAssignmentMatchesOrder(parsedCatalogueId, order.catalogueId);
            if (!bookGuard.ok) {
                return NextResponse.json(
                    { error: bookGuard.message },
                    { status: bookGuard.httpStatus }
                );
            }
        }

        // An auditeur can't be the initial reader.
        let readerPreferredDelivery: DeliveryMethod | null = null;
        if (readerId) {
            const reader = await prisma.user.findUnique({
                where: { id: parseInt(readerId) },
                select: { id: true, memberType: true, preferredDeliveryMethod: true },
            });
            if (!reader) {
                return NextResponse.json({ error: 'Lecteur non trouvé' }, { status: 404 });
            }
            readerPreferredDelivery = reader.preferredDeliveryMethod ?? null;
            const readerGuard = guardReaderEligible(reader.memberType as string | null);
            if (!readerGuard.ok) {
                return NextResponse.json(
                    { error: readerGuard.message },
                    { status: readerGuard.httpStatus }
                );
            }

            // An inactive reader can't be assigned — the admin must reactivate
            // them first (see lib/users/activityGuard.ts).
            const activityGuard = await guardUserIsActive(parseInt(readerId), 'lecteur');
            if (!activityGuard.ok) {
                return NextResponse.json(
                    { message: activityGuard.message, blocked: activityGuard.blocked },
                    { status: activityGuard.httpStatus }
                );
            }
        }

        // Per-attribution delivery method: an explicit value wins; otherwise
        // seed from the initial reader's profile preference (snapshot at creation,
        // so later profile edits don't retroactively change this attribution).
        const effectiveDelivery: DeliveryMethod | null =
            (deliveryMethod as DeliveryMethod | undefined) ?? readerPreferredDelivery ?? null;

        const result = await prisma.$transaction(async (tx) => {
            const assignment = await tx.assignment.create({
                data: {
                    catalogueId: parsedCatalogueId,
                    orderId: parsedOrderId,
                    receptionDate: receptionDate ? new Date(receptionDate) : null,
                    sentToReaderDate: sentToReaderDate ? new Date(sentToReaderDate) : null,
                    returnedToECADate: returnedToECADate ? new Date(returnedToECADate) : null,
                    statusId: parsedStatusId,
                    notes: notes || null,
                    deliveryMethod: effectiveDelivery,
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
                        notes: 'Attribution initiale',
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

        // Notification — fired AFTER the transaction commits (sendAssignmentReminder
        // never throws). Creation is a single event, distinct from later edits, so
        // there's no overlap with the readers route or the PUT 'sent' email.
        //   created EN_COURS              -> 'sent'     (date = sentToReaderDate)
        //   created ATTENTE with a reader -> 'assigned' (date = AssignmentReader.assignedDate)
        //   created ATTENTE without reader, or created TERMINE (backfill) -> nothing
        if (result?.catalogue) {
            const initialRecord = result.readerHistory[0];
            const initialReader = initialRecord?.reader;
            const book = {
                title: result.catalogue.title,
                author: result.catalogue.author,
            };

            if (result.statusId === STATUS.EN_COURS && initialReader) {
                await sendAssignmentReminder({
                    reader: initialReader,
                    book,
                    assignmentId: result.id,
                    date: result.sentToReaderDate,
                    variant: 'sent',
                    deliveryMethod: result.deliveryMethod,
                });
            } else if (result.statusId === STATUS.ATTENTE && initialReader) {
                await sendAssignmentReminder({
                    reader: initialReader,
                    book,
                    assignmentId: result.id,
                    date: initialRecord?.assignedDate,
                    variant: 'assigned',
                    deliveryMethod: result.deliveryMethod,
                });
            }
        }

        return NextResponse.json({ assignment: result }, { status: 201 });
    } catch (error) {
        console.error('Error creating assignment:', error);
        return NextResponse.json(
            {
                error: 'Échec de création de l\'attribution',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}