import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Pragmatic format check — catches the obvious garbage (empty, whitespace,
// missing @ or domain) that would otherwise bounce. Not full RFC validation,
// and it can't catch valid-but-nonexistent addresses (only a real send/bounce
// reveals those — handle that via a bounce webhook + suppression list).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSendableEmail(email: string | null | undefined): boolean {
    const e = email?.trim();
    return !!e && EMAIL_RE.test(e);
}

export interface SendEmailParams {
    to: string | null | undefined;
    subject: string;
    html: string;
    from?: string;
    /** Log context, e.g. 'assignment-reminder:sent', 'invitation'. */
    tag?: string;
}

export type SendEmailResult = { sent: boolean; reason?: string };

/**
 * The single chokepoint for all outbound email. Validates the recipient before
 * touching Resend (bounce protection) and never throws — it returns a result so
 * each caller decides whether to log-and-continue (reminders) or surface the
 * failure to the user (critical-path invitations / password resets).
 */
export async function sendEmail({
                                    to,
                                    subject,
                                    html,
                                    from = process.env.RESEND_FROM_EMAIL || 'noreply@eca-aveugles.com',
                                    tag,
                                }: SendEmailParams): Promise<SendEmailResult> {
    const label = tag ? `[${tag}] ` : '';
    const recipient = to?.trim();

    if (!isSendableEmail(recipient)) {
        console.warn(`${label}Skipping email — missing/invalid recipient`);
        return { sent: false, reason: recipient ? 'invalid-email' : 'no-email' };
    }

    try {
        const result = await resend.emails.send({ from, to: recipient!, subject, html });
        if (result.error) {
            console.error(`${label}Resend error:`, result.error);
            return { sent: false, reason: result.error.message };
        }
        return { sent: true };
    } catch (error) {
        console.error(`${label}Error sending email:`, error);
        return { sent: false, reason: error instanceof Error ? error.message : 'unknown' };
    }
}