import { render } from '@react-email/render';
import AssignmentReminderEmail, { ReminderVariant } from '@/components/emails/AssignmentReminderEmail';
import { sendEmail, SendEmailResult } from './sendEmail';

interface SendAssignmentReminderParams {
    reader: {
        email: string | null;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
    };
    book: {
        title: string;
        author?: string | null;
    };
    assignmentId?: number;
    /**
     * The date relevant to this notification:
     *  - 'assigned' / 'reassigned_*': AssignmentReader.assignedDate
     *  - 'sent': Assignment.sentToReaderDate
     */
    date?: Date | string | null;
    variant?: ReminderVariant;
    /** Branches email wording (pickup vs shipping). Snapshot from the attribution. */
    deliveryMethod?: 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE' | null;
}

/**
 * Renders the assignment notification and sends it via the shared sendEmail
 * chokepoint (which owns recipient validation). Never throws.
 */
export async function sendAssignmentReminder({
                                                 reader,
                                                 book,
                                                 assignmentId,
                                                 date,
                                                 variant = 'assigned',
                                                 deliveryMethod = null,
                                             }: SendAssignmentReminderParams): Promise<SendEmailResult> {
    const displayName = reader.name || reader.firstName || '';
    const displayDate = date ? new Date(date).toLocaleDateString('fr-FR') : null;

    const appName = process.env.APP_NAME || 'ECA Aveugles';
    const baseUrl = process.env.APP_URL || 'https://eca-aveugles.com';
    const logoUrl = `${baseUrl}/eca_logo.png`;

    const subject =
        variant === 'sent' ? (deliveryMethod === 'RETRAIT'
                ? `Votre lecture est disponible au retrait : ${book.title} - ${appName}`
                : `Votre lecture a été envoyée : ${book.title} - ${appName}`)
            : variant === 'assigned' ? `Nouvelle lecture assignée : ${book.title} - ${appName}`
                : `Lecture réassignée : ${book.title} - ${appName}`;

    let html: string;
    try {
        html = await render(
            AssignmentReminderEmail({
                name: displayName,
                bookTitle: book.title,
                bookAuthor: book.author ?? null,
                assignmentId,
                displayDate,
                appName,
                logoUrl,
                variant,
                deliveryMethod,
            })
        );
    } catch (error) {
        console.error('Error rendering assignment reminder:', error);
        return { sent: false, reason: 'render-failed' };
    }

    return sendEmail({
        to: reader.email,
        subject,
        html,
        tag: `assignment-reminder:${variant}#${assignmentId ?? 'n/a'}`,
    });
}