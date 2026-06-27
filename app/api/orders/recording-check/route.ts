import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';
import { withAdmin } from '@/lib/auth/guards';

/**
 * GET /api/orders/recording-check?bookId=123[&excludeOrderId=45]
 *
 * Returns whether a book already has ACTIVE "enregistrement nécessaire" demande(s)
 * — i.e. orders with lentPhysicalBook=true that are still active (isActive=true)
 * and not Terminé/Soldé. Used by the order forms to warn before creating a second
 * recording demande for the same book.
 *
 * `excludeOrderId` lets the edit form ignore the order it is currently editing.
 */
export const GET = withAdmin(async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const bookId = Number(searchParams.get('bookId'));
    const excludeOrderId = Number(searchParams.get('excludeOrderId'));

    if (!Number.isInteger(bookId) || bookId <= 0) {
        return NextResponse.json({ message: 'bookId requis' }, { status: 400 });
    }

    const orders = await prisma.orders.findMany({
        where: {
            catalogueId: bookId,
            isActive: true,
            lentPhysicalBook: true,
            statusId: { notIn: [STATUS.TERMINE, STATUS.SOLDE] },
            ...(Number.isInteger(excludeOrderId) && excludeOrderId > 0
                ? { id: { not: excludeOrderId } }
                : {}),
        },
        select: {
            id: true,
            aveugle: { select: { name: true } },
            status: { select: { name: true } },
        },
        orderBy: { id: 'desc' },
        take: 10,
    });

    return NextResponse.json({
        activeRecordingCount: orders.length,
        orders,
    });
});
