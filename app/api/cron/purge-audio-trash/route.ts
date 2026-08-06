import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isSuperAdmin } from '@/lib/auth/guards';
import { purgeExpiredAudioTrash } from '@/lib/audio/purge';

/**
 * Nightly sweep of the audio corbeille past its retention window (14 days,
 * exempting anything soft-deleted before the sweep shipped — see
 * lib/audio/purge.ts and the DeletedAudioTrack doc comment). Scheduled by
 * vercel.json.
 *
 * Same two ways in as /api/cron/purge-audit-events: Vercel's scheduler
 * (`Authorization: Bearer <CRON_SECRET>`), or a signed-in super admin. There
 * is no session behind a cron invocation, so the secret is the guard — with
 * none configured the route refuses rather than standing open.
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
        const result = await purgeExpiredAudioTrash();
        if (result.purged > 0 || result.failed > 0) {
            console.log(
                `[cron] purge-audio-trash: ${result.purged} fichier(s) supprimé(s) du bucket, ` +
                `${result.failed} échec(s), ${result.remaining} restant(s) à traiter`
            );
        }
        return NextResponse.json(result);
    } catch (error) {
        console.error('[cron] purge-audio-trash failed:', error);
        return NextResponse.json({ message: 'La purge a échoué' }, { status: 500 });
    }
}

export const GET = run;
export const POST = run;
