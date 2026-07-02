import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UserActivityStatus } from '@prisma/client';
import { USER_ACTIVITY_STATUS_VALUES, ACTIVE_USER_ACTIVITY_STATUSES } from '@/lib/user-activity-enums';

// History of a member's activity-status changes, newest first.
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
        const events = await prisma.userActivityEvent.findMany({
            where: { userId },
            orderBy: { changedAt: 'desc' },
            select: {
                id: true,
                fromStatus: true,
                toStatus: true,
                reason: true,
                comment: true,
                changedAt: true,
                changedBy: {
                    select: { id: true, name: true, firstName: true, lastName: true },
                },
            },
        });

        return NextResponse.json({ events });
    } catch (error) {
        console.error('activity history error:', error);
        return NextResponse.json({ message: 'Failed to load history' }, { status: 500 });
    }
}

// Record a status change: writes a history event (capturing the acting admin)
// and updates the user's current activityStatus.
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    revalidateAdmin();
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

    let body: { toStatus?: string; reason?: string; comment?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
    }

    const toStatus = body.toStatus;
    if (!toStatus || !(USER_ACTIVITY_STATUS_VALUES as readonly string[]).includes(toStatus)) {
        return NextResponse.json({ message: 'Statut invalide' }, { status: 400 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { activityStatus: true },
        });
        if (!user) {
            return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
        }

        const changedById = session.user.id ? parseInt(session.user.id) : null;
        const now = new Date();

        // One-directional sync: leaving an active status always clears
        // isAvailable, so an inactive/resigned/etc. person can't stay
        // selectable for new attributions. Reactivating does NOT force
        // isAvailable back to true — that flag also covers "active but
        // temporarily unavailable" and shouldn't be silently overwritten.
        const becomingInactive = !(ACTIVE_USER_ACTIVITY_STATUSES as readonly string[]).includes(toStatus);

        const [event] = await prisma.$transaction([
            prisma.userActivityEvent.create({
                data: {
                    userId,
                    fromStatus: user.activityStatus,
                    toStatus: toStatus as UserActivityStatus,
                    reason: body.reason?.trim() || null,
                    comment: body.comment?.trim() || null,
                    changedById,
                    changedAt: now,
                },
                select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    reason: true,
                    comment: true,
                    changedAt: true,
                    changedBy: { select: { id: true, name: true, firstName: true, lastName: true } },
                },
            }),
            prisma.user.update({
                where: { id: userId },
                data: {
                    activityStatus: toStatus as UserActivityStatus,
                    activityChangedAt: now,
                    ...(becomingInactive ? { isAvailable: false } : {}),
                },
            }),
        ]);

        return NextResponse.json({ event });
    } catch (error) {
        console.error('activity change error:', error);
        return NextResponse.json({ message: 'Failed to change status' }, { status: 500 });
    }
}