import { render } from '@react-email/render';
import InvitationEmail from '@/components/emails/InvitationEmail';
import { sendEmail, SendEmailResult } from './sendEmail';

interface SendInvitationEmailParams {
    email: string;
    name?: string | null;
    accessLevel: string;
    memberType?: string | null;
    temporaryPassword: string;
}

/**
 * Renders the invitation (with the user's temporary password) and sends it via the
 * shared sendEmail chokepoint. Used wherever a login account is provisioned — the
 * invite route and the create route. Never throws.
 */
export async function sendInvitationEmail({
                                              email,
                                              name,
                                              accessLevel,
                                              memberType,
                                              temporaryPassword,
                                          }: SendInvitationEmailParams): Promise<SendEmailResult> {
    const appName = process.env.APP_NAME || 'ECA Aveugles';
    const baseUrl = process.env.APP_URL;

    let html: string;
    try {
        html = await render(
            InvitationEmail({
                name: name || '',
                email,
                accessLevel,
                memberType: memberType || undefined,
                temporaryPassword,
                appName,
                loginUrl: baseUrl ? `${baseUrl}/admin` : undefined,
                logoUrl: baseUrl ? `${baseUrl}/eca_logo.png` : undefined,
            })
        );
    } catch (error) {
        console.error('Error rendering invitation email:', error);
        return { sent: false, reason: 'render-failed' };
    }

    return sendEmail({
        to: email,
        subject: `Invitation à rejoindre ${appName}`,
        html,
        tag: 'invitation',
    });
}