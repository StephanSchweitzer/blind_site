import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { claimUploadLease, isLeaseToken, releaseUploadLease } from '@/lib/audio/uploadLease';

/**
 * Keep or let go of the book an upload is filling — see lib/audio/uploadLease.ts.
 *
 * The claim itself is taken by `upload-url`, on the upload's first signing
 * request. This route serves the dialogue between and after those requests:
 *
 *  - `renew`, every two minutes while files are still on their way: a large
 *    track can take longer to PUT than the claim lives. A 409 means someone
 *    took the book over (this tab slept past the claim) and the dialogue stops
 *    starting new PUTs.
 *  - `release`, once the upload is over, so the next permanent doesn't wait
 *    out the claim. Only the holder's own token releases; a stale release is a
 *    no-op, never someone else's claim lifted.
 */
export const POST = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const token = body?.token;
    if (!isLeaseToken(token)) {
        return NextResponse.json({ message: 'Jeton d’envoi invalide' }, { status: 400 });
    }

    if (body?.action === 'release') {
        await releaseUploadLease(bookId, token);
        return NextResponse.json({ released: true });
    }
    if (body?.action === 'renew') {
        const lease = await claimUploadLease(bookId, me.id, token);
        if (!lease.ok) {
            return NextResponse.json(
                { message: lease.message, uploadLease: { holder: lease.holder, until: lease.until } },
                { status: 409 },
            );
        }
        return NextResponse.json({ renewed: true });
    }
    return NextResponse.json({ message: 'Action inconnue' }, { status: 400 });
});
