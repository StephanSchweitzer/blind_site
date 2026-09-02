// app/api/password-reset/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetLink } from '@/lib/email/sendPasswordResetLink';
import { getUserNameOnly } from '@/lib/users/displayName';
import {
    createResetToken,
    mayResetOwnPassword,
    throttleResetRequest,
} from '@/lib/auth/password-reset';

/**
 * PUBLIC BY NECESSITY — the one place a route here is not wrapped in a guard.
 * Someone who has locked themselves out cannot authenticate, so the reset
 * request has to be reachable signed out. What keeps it narrow instead:
 *
 *  - a link is only ever issued for an account that ALREADY EXISTS and ALREADY
 *    has admin/super_admin access. No account is ever created, and a member or
 *    an unknown address gets nothing;
 *  - the response is byte-identical in every case (unknown address, member,
 *    permanent, throttled, email failure), so this cannot be used to enumerate
 *    accounts or find out who is a permanent;
 *  - nothing about the account changes here. Spamming someone else's address
 *    cannot lock them out — their password keeps working until they themselves
 *    open the link.
 *
 * See lib/auth/password-reset.ts for the token itself.
 */
const GENERIC_RESPONSE = {
    message:
        "Si un compte permanent existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Pensez à vérifier vos courriers indésirables.",
};

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const email = typeof body?.email === 'string' ? body.email.trim() : '';

        if (!email) {
            return NextResponse.json({ message: 'Adresse email requise' }, { status: 400 });
        }

        // Everything below fails silently into the same answer on purpose.
        if (!throttleResetRequest(email)) {
            return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
        }

        // findFirst — the soft-delete extension excludes deleted users from it,
        // so a deleted account can't be revived through a reset link.
        const user = await prisma.user.findFirst({
            where: { email: { mode: 'insensitive', equals: email } },
            select: {
                id: true,
                email: true,
                accessLevel: true,
                firstName: true,
                lastName: true,
                name: true,
            },
        });

        if (!mayResetOwnPassword(user)) {
            console.info(`[password-reset] request refused for a non-permanent or unknown address`);
            return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
        }

        const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;
        if (!baseUrl) {
            // Without a base URL the link would be unusable; better to say nothing
            // happened than to mail a broken one.
            console.error('[password-reset] APP_URL/NEXTAUTH_URL not set — no link sent');
            return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
        }

        const token = await createResetToken(user.id);
        const result = await sendPasswordResetLink({
            email: user.email!,
            name: getUserNameOnly(user),
            resetUrl: `${baseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`,
        });

        if (!result.sent) {
            // Don't leave a live token behind for a link nobody received.
            await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
            console.warn(`[password-reset] link email not sent (user ${user.id}): ${result.reason}`);
        }

        return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    } catch (error) {
        console.error('[password-reset] Error handling reset request:', error);
        // Same shape as success: an error here must not become a signal either.
        return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
    }
}
