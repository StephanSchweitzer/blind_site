import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeCotisationStatus } from '@/lib/cotisation';

// Current cotisation status for a member: is it up to date, and when does it
// expire? Computed from active COTISATION payments via lib/cotisation.ts.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    try {
        const payments = await prisma.payment.findMany({
            where: { clientId: userId, type: 'COTISATION', isActive: true },
            select: { cotisationYear: true, paymentDate: true, creationDate: true },
        });

        const status = computeCotisationStatus(payments);

        return NextResponse.json({
            isPaid: status.isPaid,
            expiresAt: status.expiresAt ? status.expiresAt.toISOString() : null,
            coverYear: status.coverYear,
            latestPaymentDate: status.latestPaymentDate
                ? status.latestPaymentDate.toISOString()
                : null,
        });
    } catch (error) {
        console.error('cotisation status error:', error);
        return NextResponse.json({ message: 'Failed to load cotisation status' }, { status: 500 });
    }
}
