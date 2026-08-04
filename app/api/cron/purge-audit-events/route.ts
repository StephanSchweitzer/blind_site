import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { AUDIT_TABLE_SOFT_LIMIT_MB } from '@/lib/audit/config';
import { purgeAuditEvents } from '@/lib/audit/retention';

/**
 * Nightly purge of the audit trail past its retention window (14 days, 7 once
 * the table passes AUDIT_TABLE_SOFT_LIMIT_MB). Scheduled by vercel.json.
 *
 * Two ways in, and only two:
 *   - Vercel's scheduler, which sends `Authorization: Bearer <CRON_SECRET>`.
 *     Like /api/cron/expire-unavailability there is no session behind a cron
 *     invocation, so the secret is the guard — and with no secret configured
 *     the route refuses rather than standing open.
 *   - a signed-in super admin, so the purge can be forced from /admin/stats
 *     when the size warning shows up.
 */
export const dynamic = 'force-dynamic';

async function isAuthorized(request: NextRequest): Promise<boolean> {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get('authorization') === `Bearer ${secret}`) return true;

    const me = await getCurrentUser();
    return me !== null && isSuperAdmin(me.accessLevel);
}

async function run(request: NextRequest) {
    if (!(await isAuthorized(request))) {
        return NextResponse.json({ message: 'Non autorisé' }, { status: 401 });
    }

    try {
        const result = await purgeAuditEvents();
        if (result.deleted > 0 || result.underPressure) {
            console.log(
                `[cron] purge-audit-events: ${result.deleted} événement(s) supprimé(s), ` +
                `rétention ${result.retentionDays} j, table ${result.megabytes} Mo` +
                (result.underPressure ? ` (seuil ${AUDIT_TABLE_SOFT_LIMIT_MB} Mo dépassé)` : '')
            );
        }
        return NextResponse.json(result);
    } catch (error) {
        console.error('[cron] purge-audit-events failed:', error);
        return NextResponse.json({ message: 'La purge a échoué' }, { status: 500 });
    }
}

export const GET = run;
export const POST = run;
