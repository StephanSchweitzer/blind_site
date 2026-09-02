// app/api/password-reset/confirm/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { render } from '@react-email/render';
import PasswordChangedEmail from '@/components/emails/PasswordChangedEmail';
import { sendEmail } from '@/lib/email/sendEmail';
import { getUserNameOnly } from '@/lib/users/displayName';
import { resolveResetToken } from '@/lib/auth/password-reset';
import { validateNewPassword } from '@/lib/auth/passwordStrength';

/**
 * PUBLIC BY NECESSITY, like the request route next to it — knowledge of the
 * single-use token IS the authentication here. The token is 256 bits of CSPRNG
 * output, stored only as a SHA-256, valid once, for 30 minutes, and re-checked
 * against the account's CURRENT access level so a link issued to someone since
 * demoted stops working.
 */

const INVALID_LINK = {
    message:
        "Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau depuis la page de connexion.",
};

/** Lets the reset page say the link is dead before the user types a password. */
export async function GET(req: Request) {
    const token = new URL(req.url).searchParams.get('token');
    const resolved = await resolveResetToken(token);
    return NextResponse.json({ valid: resolved.ok }, { status: 200 });
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const token = typeof body?.token === 'string' ? body.token : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        const problem = validateNewPassword(password);
        if (problem) {
            return NextResponse.json({ message: problem }, { status: 400 });
        }

        const resolved = await resolveResetToken(token);
        if (!resolved.ok) {
            return NextResponse.json(INVALID_LINK, { status: 400 });
        }

        const { user, tokenId } = resolved;
        const hashedPassword = await bcrypt.hash(password, 10);

        // One transaction: the password only changes if the link is burnt with
        // it, so a retry of the same link can never set a second password.
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword, passwordNeedsChange: false },
            }),
            prisma.passwordResetToken.update({
                where: { id: tokenId },
                data: { usedAt: new Date() },
            }),
        ]);

        // Best-effort security notification — the reset has already succeeded, so
        // a failed send must not fail the request (same rule as change-password).
        try {
            const appName = process.env.APP_NAME || 'ECA Aveugles';
            const baseUrl = process.env.APP_URL || 'https://eca-aveugles.com';
            const html = await render(
                PasswordChangedEmail({
                    name: getUserNameOnly(user),
                    appName,
                    changedAt: new Date().toLocaleString('fr-FR'),
                    logoUrl: `${baseUrl}/eca_logo.png`,
                })
            );
            const result = await sendEmail({
                to: user.email,
                subject: `Votre mot de passe a été modifié - ${appName}`,
                html,
                tag: 'password-changed',
            });
            if (!result.sent) {
                console.warn(`[password-reset] confirmation not sent (user ${user.id}): ${result.reason}`);
            }
        } catch (emailError) {
            console.error('[password-reset] Error sending password-changed confirmation:', emailError);
        }

        return NextResponse.json({ message: 'Mot de passe réinitialisé avec succès' }, { status: 200 });
    } catch (error) {
        console.error('[password-reset] Error confirming reset:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la réinitialisation du mot de passe' },
            { status: 500 }
        );
    }
}
