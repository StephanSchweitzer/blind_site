import { render } from '@react-email/render';
import PasswordResetRequestEmail from '@/components/emails/PasswordResetRequestEmail';
import { sendEmail, SendEmailResult } from './sendEmail';
import { RESET_TOKEN_TTL_MINUTES } from '@/lib/auth/password-reset';

interface SendPasswordResetLinkParams {
    email: string;
    name?: string | null;
    /** The single-use link, already built with the token. Never logged. */
    resetUrl: string;
}

/**
 * Renders the self-service reset link and sends it via the shared sendEmail
 * chokepoint. Used only by the sign-in-page reset request. Never throws.
 */
export async function sendPasswordResetLink({
                                                email,
                                                name,
                                                resetUrl,
                                            }: SendPasswordResetLinkParams): Promise<SendEmailResult> {
    const appName = process.env.APP_NAME || 'ECA Aveugles';
    const baseUrl = process.env.APP_URL;

    let html: string;
    try {
        html = await render(
            PasswordResetRequestEmail({
                name: name || '',
                email,
                resetUrl,
                expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
                appName,
                logoUrl: baseUrl ? `${baseUrl}/eca_logo.png` : undefined,
            })
        );
    } catch (error) {
        console.error('Error rendering password-reset link email:', error);
        return { sent: false, reason: 'render-failed' };
    }

    return sendEmail({
        to: email,
        subject: `Réinitialisation de votre mot de passe - ${appName}`,
        html,
        tag: 'password-reset-link',
    });
}
