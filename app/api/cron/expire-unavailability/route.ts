import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import {
    closeElapsedUnavailabilities,
    describeExpiryResult,
} from '@/lib/users/expireUnavailability';

/**
 * Nightly sweep that returns members whose indisponibilité has run its term to
 * the Actif status (see lib/users/expireUnavailability.ts). Scheduled by
 * vercel.json.
 *
 * NOT wrapped in withAuth/withAdmin: there is no session behind a cron
 * invocation. It is guarded by CRON_SECRET instead — Vercel sends it as
 * `Authorization: Bearer <CRON_SECRET>`. With no secret configured the route
 * refuses to run rather than standing open. /api/cron is outside the
 * middleware matcher, so nothing else gates it.
 */
export const dynamic = 'force-dynamic';

function isAuthorizedCron(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
    if (!isAuthorizedCron(request)) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const result = await closeElapsedUnavailabilities();
        if (result.closed > 0) {
            // Only touch the cache when something actually changed.
            revalidateAdmin();
            console.log(`[cron] ${describeExpiryResult(result)} (ids: ${result.userIds.join(', ')})`);
        }
        return NextResponse.json({ closed: result.closed, userIds: result.userIds });
    } catch (error) {
        console.error('[cron] expire-unavailability failed:', error);
        return NextResponse.json({ message: 'Sweep failed' }, { status: 500 });
    }
}
