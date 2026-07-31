import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { UserActivityStatus } from '@prisma/client';
import { OFFERED_USER_ACTIVITY_STATUSES, isDatedActivityStatus } from '@/lib/user-activity-enums';
import { isEffectivelyActive, parseUnavailabilityWindow } from '@/lib/users/activityStatus';
import { withAdmin } from '@/lib/auth/guards';

// History of a member's activity-status changes, newest first, plus the
// person's CURRENT stored status and window. The user row is the source of
// truth — a member whose status predates the history has no event at all, so
// the badge can't be derived from events alone.
export const GET = withAdmin(async (_request, { params }) => {
    const { id } = await params!;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    try {
        const [current, events] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: { activityStatus: true, unavailableFrom: true, unavailableUntil: true },
            }),
            prisma.userActivityEvent.findMany({
                where: { userId },
                orderBy: { changedAt: 'desc' },
                select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    reason: true,
                    comment: true,
                    unavailableFrom: true,
                    unavailableUntil: true,
                    changedAt: true,
                    changedBy: {
                        select: { id: true, name: true, firstName: true, lastName: true },
                    },
                },
            }),
        ]);

        if (!current) {
            return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
        }

        return NextResponse.json({ current, events });
    } catch (error) {
        console.error('activity history error:', error);
        return NextResponse.json({ message: 'Failed to load history' }, { status: 500 });
    }
});

// Record a status change: writes a history event (capturing the acting admin)
// and updates the user's current activityStatus.
export const POST = withAdmin(async (request, { me, params }) => {
    revalidateAdmin();

    const { id } = await params!;
    const userId = parseInt(id, 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'Invalid id' }, { status: 400 });
    }

    let body: {
        toStatus?: string;
        reason?: string;
        comment?: string;
        unavailableFrom?: string;
        unavailableUntil?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
    }

    // Only the offered statuses can be APPLIED. The legacy ones stay readable
    // (and stay selectable-as-current in the pickers) but can never be set
    // again, which is what retires them without touching existing records.
    const toStatus = body.toStatus;
    if (!toStatus || !(OFFERED_USER_ACTIVITY_STATUSES as readonly string[]).includes(toStatus)) {
        return NextResponse.json({ message: 'Statut invalide' }, { status: 400 });
    }

    // UNAVAILABLE always carries its window; every other status clears it, so a
    // person can never keep a stale window behind their current status.
    let window: { from: Date; until: Date } | null = null;
    if (isDatedActivityStatus(toStatus)) {
        const parsed = parseUnavailabilityWindow(body.unavailableFrom, body.unavailableUntil);
        if (!parsed.ok) {
            return NextResponse.json({ message: parsed.message }, { status: 400 });
        }
        window = { from: parsed.from, until: parsed.until };
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { activityStatus: true },
        });
        if (!user) {
            return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
        }

        const changedById = me.id;
        const now = new Date();

        // One-directional sync: leaving an active status always clears
        // isAvailable, so an inactive/resigned/etc. person can't stay
        // selectable for new attributions. Reactivating does NOT force
        // isAvailable back to true — that flag also covers "active but
        // temporarily unavailable" and shouldn't be silently overwritten.
        //
        // Judged on the EFFECTIVE status: an unavailability booked for next
        // month leaves the person active today, so it must not clear the flag
        // now. When that window opens, the effective status turns UNAVAILABLE
        // on its own and the attribution guard blocks them — no row rewrite.
        const becomingInactive = !isEffectivelyActive({
            activityStatus: toStatus,
            unavailableFrom: window?.from ?? null,
            unavailableUntil: window?.until ?? null,
        }, now);

        const [event] = await prisma.$transaction([
            prisma.userActivityEvent.create({
                data: {
                    userId,
                    fromStatus: user.activityStatus,
                    toStatus: toStatus as UserActivityStatus,
                    reason: body.reason?.trim() || null,
                    comment: body.comment?.trim() || null,
                    unavailableFrom: window?.from ?? null,
                    unavailableUntil: window?.until ?? null,
                    changedById,
                    changedAt: now,
                },
                select: {
                    id: true,
                    fromStatus: true,
                    toStatus: true,
                    reason: true,
                    comment: true,
                    unavailableFrom: true,
                    unavailableUntil: true,
                    changedAt: true,
                    changedBy: { select: { id: true, name: true, firstName: true, lastName: true } },
                },
            }),
            prisma.user.update({
                where: { id: userId },
                data: {
                    activityStatus: toStatus as UserActivityStatus,
                    activityChangedAt: now,
                    unavailableFrom: window?.from ?? null,
                    unavailableUntil: window?.until ?? null,
                    ...(becomingInactive ? { isAvailable: false } : {}),
                },
            }),
        ]);

        return NextResponse.json({ event });
    } catch (error) {
        console.error('activity change error:', error);
        return NextResponse.json({ message: 'Failed to change status' }, { status: 500 });
    }
});