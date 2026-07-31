import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { getUserActivitySnapshot, composeUserDisplayName } from '@/lib/users/activityGuard';
import { getUserActivityStatusLabel } from '@/lib/user-activity-enums';
import {
    describeUnavailability,
    isEffectivelyActive,
    resolveEffectiveActivityStatus,
    toDayString,
} from '@/lib/users/activityStatus';

/**
 * GET /api/user/[id]/status
 *
 * Lightweight activity-status lookup — used by the order/assignment forms to
 * check a person BEFORE letting an admin select them (so the reactivation
 * dialog can be shown immediately, without waiting on the create/update API
 * to reject the request). The actual write paths (orders, assignments) also
 * enforce this server-side via lib/users/activityGuard.ts, so this route is
 * a UX nicety, not the only line of defense.
 */
export const GET = withAdmin(async (
    _req: NextRequest,
    { params }: { params?: Promise<Record<string, string>> }
) => {
    const { id } = (await params) ?? {};
    const userId = parseInt(id ?? '', 10);
    if (Number.isNaN(userId)) {
        return NextResponse.json({ message: 'ID de personne invalide' }, { status: 400 });
    }

    const snapshot = await getUserActivitySnapshot(userId);
    if (!snapshot) {
        return NextResponse.json({ message: 'Personne introuvable' }, { status: 404 });
    }

    const { user, latestEvent } = snapshot;

    // Effective status: a booked-but-not-started (or already elapsed)
    // unavailability reads as ACTIVE and must not block the form.
    const effectiveStatus = resolveEffectiveActivityStatus(user);

    return NextResponse.json({
        id: user.id,
        name: composeUserDisplayName(user),
        activityStatus: effectiveStatus,
        statusLabel: getUserActivityStatusLabel(effectiveStatus),
        statusDetail: describeUnavailability(user),
        isActive: isEffectivelyActive(user),
        // The stored window, so the dialog can prefill it when the permanent
        // edits the unavailability instead of ending it.
        unavailableFrom: toDayString(user.unavailableFrom),
        unavailableUntil: toDayString(user.unavailableUntil),
        reason: latestEvent?.reason ?? null,
        comment: latestEvent?.comment ?? null,
        changedAt: (latestEvent?.changedAt ?? user.activityChangedAt)?.toISOString() ?? null,
    });
});