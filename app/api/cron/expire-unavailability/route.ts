import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
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
 * invocation. Same two ways in as the other cron routes (CLAUDE.md): Vercel's
 * scheduler (`Authorization: Bearer <CRON_SECRET>`), or a signed-in super admin
 * — this one used to accept only the first, so the sweep could not be run by
 * hand. With no secret configured the secret path refuses rather than standing
 * open. /api/cron is outside the proxy matcher (proxy.ts), so nothing else
 * gates it.
 */
export const dynamic = 'force-dynamic';

async function isAuthorizedCron(request: NextRequest): Promise<boolean> {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;

    const me = await getCurrentUser();
    return me !== null && isSuperAdmin(me.accessLevel) && !me.passwordNeedsChange;
}

export async function GET(request: NextRequest) {
    if (!(await isAuthorizedCron(request))) {
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
