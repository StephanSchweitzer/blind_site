import { parisDayKey } from '@/lib/paris-day';

/**
 * Une demande partie APRÈS le règlement qu'elle réclamait : la contradiction que
 * rien ne doit écrire, comme un paiement antérieur à l'émission de sa facture
 * (paymentPrecedesIssue, lib/billing.ts). En jours français, pour qu'une demande
 * et un règlement du même jour passent.
 *
 * L'inverse est permis, et c'est le cas courant : un paiement encaissé sans avoir
 * été demandé n'a pas de date de demande du tout.
 */
export function requestFollowsPayment(requestDate: Date | null, paymentDate: Date | null): boolean {
    if (!requestDate || !paymentDate) return false;
    return parisDayKey(requestDate) > parisDayKey(paymentDate);
}

export const REQUEST_AFTER_PAYMENT_MESSAGE =
    'La date de la demande ne peut pas suivre la date de paiement';
