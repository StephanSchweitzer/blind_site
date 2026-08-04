import { prisma } from '@/lib/prisma';
import { sendEmail, isSendableEmail, SendEmailResult } from './sendEmail';

interface EscalatedBook {
    id: number;
    title: string;
    author: string | null;
    audio_filepath: string | null;
    source_access_id: number | null;
}

export interface SendReviewEscalationParams {
    /** The book sitting in the review queue. */
    flagged: EscalatedBook;
    /** Its Access-import counterpart, when one was resolved. */
    matched: EscalatedBook | null;
    /** The pair carries two different recordings — the merge is blocked outright. */
    audioConflict: boolean;
    /**
     * What the permanent says is wrong. Optional only for the audio conflict,
     * which is self-explanatory; on any other pair this is the whole reason the
     * mail is worth reading.
     */
    note: string | null;
    /** Who pressed the button. */
    escalatedBy: string;
}

/**
 * Who receives duplicate escalations. REVIEW_ESCALATION_EMAIL when set;
 * otherwise the first super admin on record — these pairs can only be sorted
 * out by hand in the database, which is a super admin's job anyway.
 */
async function escalationRecipient(): Promise<string | null> {
    const configured = process.env.REVIEW_ESCALATION_EMAIL?.trim();
    if (isSendableEmail(configured)) return configured!;

    const superAdmin = await prisma.user.findFirst({
        where: { accessLevel: 'super_admin', email: { not: null } },
        orderBy: { id: 'asc' },
        select: { email: true },
    });
    return superAdmin?.email ?? null;
}

const esc = (v: string | number | null): string =>
    v == null || v === ''
        ? '—'
        : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bookBlock = (label: string, b: EscalatedBook): string => `
    <h3 style="margin:24px 0 4px;font-size:15px;">${esc(label)} — #${b.id}</h3>
    <table cellpadding="4" style="border-collapse:collapse;font-size:14px;">
      <tr><td style="color:#666;">Titre</td><td>${esc(b.title)}</td></tr>
      <tr><td style="color:#666;">Auteur</td><td>${esc(b.author)}</td></tr>
      <tr><td style="color:#666;">Fichier audio</td><td><code>${esc(b.audio_filepath)}</code></td></tr>
      <tr><td style="color:#666;">ID source (Access)</td><td>${esc(b.source_access_id)}</td></tr>
    </table>`;

/**
 * Internal alert — no branding, no template: it goes to one permanent who then
 * opens the database. Routed through the sendEmail chokepoint like everything else.
 */
export async function sendReviewEscalation({
    flagged,
    matched,
    audioConflict,
    note,
    escalatedBy,
}: SendReviewEscalationParams): Promise<SendEmailResult> {
    const to = await escalationRecipient();
    if (!to) return { sent: false, reason: 'no-recipient' };

    const baseUrl = process.env.APP_URL || 'https://eca-aveugles.com';

    // The permanent's own words, kept as typed (line breaks included) — they are
    // usually the only description of what the import got wrong.
    const noteBlock = note
        ? `<blockquote style="margin:16px 0;padding:8px 12px;border-left:3px solid #ccc;font-size:14px;white-space:pre-wrap;">${esc(note)}</blockquote>`
        : '';

    const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;">
      <h2 style="font-size:17px;margin:0 0 8px;">Doublon à traiter manuellement</h2>
      <p style="font-size:14px;margin:0;">
        ${esc(escalatedBy)} a signalé ce doublon depuis la file de révision${
            audioConflict
                ? ' : les deux fiches portent un enregistrement audio différent, la fusion est donc bloquée.'
                : ' — il ne peut pas être réglé depuis la file.'
        }
      </p>
      ${noteBlock}
      ${bookBlock('Fiche du catalogue', flagged)}
      ${matched ? bookBlock('Doublon (import Access)', matched) : '<p style="font-size:14px;">Aucun correspondant résolu.</p>'}
      <p style="font-size:14px;margin-top:24px;">
        <a href="${baseUrl}/admin/review?q=${encodeURIComponent(`#${flagged.id}`)}">Ouvrir dans la file de révision</a>
      </p>
    </div>`;

    return sendEmail({
        to,
        subject: `Doublon à traiter manuellement : « ${flagged.title} » (#${flagged.id})`,
        html,
        tag: `review-escalation#${flagged.id}`,
    });
}
