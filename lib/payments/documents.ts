import { prisma } from '@/lib/prisma';
import { parisDayKey } from '@/lib/paris-day';
import {
    PaymentStatus,
    derivePaymentStatus,
    formatReceiptNumber,
    isRequestablePaymentType,
} from '@/lib/payments/status';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Les deux gestes d'impression qui écrivent quelque chose : envoyer la demande,
 * émettre le reçu. Comme l'émission d'une facture depuis son bouton d'impression
 * (BillPDFButton), le papier et la base bougent ensemble — mais seulement la
 * PREMIÈRE fois. Réimprimer une demande ou un reçu ne change rien : la date de la
 * demande reste celle du premier envoi, le reçu garde son numéro.
 *
 * La pro-forma, elle, n'écrit rien : c'est un document d'information.
 *
 * Chaque fonction verrouille la ligne du paiement (FOR UPDATE) avant de la lire,
 * pour que deux clics simultanés — deux permanents, ou un double-clic — ne
 * fassent pas deux demandes datées différemment ni deux numéros de reçu.
 */

async function lockPayment(tx: TransactionClient, paymentId: number) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
            id: true,
            type: true,
            isActive: true,
            paymentDate: true,
            requestDate: true,
            receiptNumber: true,
            issueDate: true,
        },
    });
    if (!payment || !payment.isActive) throw new Error('PAYMENT_NOT_FOUND');
    return payment;
}

/**
 * La demande de paiement part aujourd'hui : un paiement « Pro-forma » devient
 * « Demandé ». Sur un paiement déjà demandé, rien ne bouge — c'est une
 * réimpression. Refusé sur un type qu'on ne demande pas, et sur un paiement déjà
 * encaissé : il n'y a plus rien à réclamer.
 */
export async function markRequestSent(tx: TransactionClient, paymentId: number, now: Date = new Date()) {
    const payment = await lockPayment(tx, paymentId);
    if (!isRequestablePaymentType(payment.type)) throw new Error('NOT_REQUESTABLE');
    const status = derivePaymentStatus(payment);
    if (status === PaymentStatus.RECEIVED) throw new Error('ALREADY_RECEIVED');
    if (status === PaymentStatus.REQUESTED) return { changed: false };
    await tx.payment.update({ where: { id: paymentId }, data: { requestDate: now } });
    return { changed: true };
}

/**
 * Le reçu d'un paiement encaissé. La première impression lui attribue le numéro
 * suivant de l'année (ReceiptCounter) et la date du jour (issueDate — la date
 * d'émission du reçu, la même colonne que la reprise utilisait pour ses reçus).
 * Un paiement qui a déjà un numéro — émis ici, ou repris de l'ancienne base — le
 * garde : c'est une réimpression.
 *
 * L'année est l'année FRANÇAISE du jour d'émission : un reçu émis le 31 décembre
 * à 23 h 30 à Paris est de cette année-là, sur le serveur en UTC comme ailleurs.
 */
export async function issueReceipt(tx: TransactionClient, paymentId: number, now: Date = new Date()) {
    const payment = await lockPayment(tx, paymentId);
    if (derivePaymentStatus(payment) !== PaymentStatus.RECEIVED) throw new Error('NOT_RECEIVED');
    if (payment.receiptNumber) return { changed: false, receiptNumber: payment.receiptNumber };

    const year = Number(parisDayKey(now).slice(0, 4));
    // Un upsert est une seule instruction : la ligne de l'année est verrouillée
    // le temps de la transaction, le numéro suivant ne peut pas être servi deux fois.
    const counter = await tx.receiptCounter.upsert({
        where: { year },
        create: { year, last: 1 },
        update: { last: { increment: 1 } },
    });
    const receiptNumber = formatReceiptNumber(year, counter.last);
    await tx.payment.update({ where: { id: paymentId }, data: { receiptNumber, issueDate: now } });
    return { changed: true, receiptNumber };
}

export const DOCUMENT_ERRORS: Record<string, [string, number]> = {
    PAYMENT_NOT_FOUND: ['Paiement introuvable', 404],
    NOT_REQUESTABLE: ['Ce type de paiement ne se demande pas : un enregistrement se règle sur sa facture, un don est toujours déjà reçu.', 400],
    ALREADY_RECEIVED: ['Ce paiement est déjà encaissé : il n’y a plus rien à demander. Imprimez plutôt son reçu.', 409],
    NOT_RECEIVED: ['Ce paiement n’est pas encore encaissé : enregistrez d’abord son règlement.', 409],
};
