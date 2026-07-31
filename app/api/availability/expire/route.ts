import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import {
    closeElapsedUnavailabilities,
    describeExpiryResult,
} from '@/lib/users/expireUnavailability';

/**
 * Runs the elapsed-indisponibilité sweep on demand, for the "Clôturer" button
 * on /admin/disponibilites. Same sweep the nightly cron runs — a permanent who
 * doesn't want to wait for it can trigger it, and it stays idempotent.
 */
export const POST = withAdmin(async () => {
    try {
        const result = await closeElapsedUnavailabilities();
        if (result.closed > 0) revalidateAdmin();
        return NextResponse.json({ ...result, message: describeExpiryResult(result) });
    } catch (error) {
        console.error('Manual unavailability sweep failed:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la clôture des indisponibilités' },
            { status: 500 }
        );
    }
});
