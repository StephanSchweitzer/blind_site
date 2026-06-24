import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/orders/[id]/assignment
 * Returns the affectation linked to an order (or null). An order is effectively
 * one-to-one with its assignment; if several ever exist we return the latest.
 * The reader is the current reader (most recent entry in the reader history).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const orderId = parseInt(id, 10);

    if (Number.isNaN(orderId)) {
        return NextResponse.json({ message: 'orderId invalide' }, { status: 400 });
    }

    try {
        const a = await prisma.assignment.findFirst({
            where: { orderId },
            orderBy: { id: 'desc' },
            select: {
                id: true,
                statusId: true,
                sentToReaderDate: true,
                returnedToECADate: true,
                status: { select: { name: true } },
                readerHistory: {
                    orderBy: { assignedDate: 'desc' },
                    take: 1,
                    select: {
                        reader: {
                            select: { id: true, name: true, firstName: true, lastName: true },
                        },
                    },
                },
            },
        });

        if (!a) return NextResponse.json(null);

        const r = a.readerHistory[0]?.reader ?? null;
        const readerName = r
            ? r.name || [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || null
            : null;

        return NextResponse.json({
            id: a.id,
            statusId: a.statusId,
            statusName: a.status.name,
            reader: r ? { id: r.id, name: readerName } : null,
            sentToReaderDate: a.sentToReaderDate,
            returnedToECADate: a.returnedToECADate,
        });
    } catch (error) {
        console.error('Error fetching order assignment:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de l\'affectation' },
            { status: 500 }
        );
    }
}