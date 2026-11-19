// Ce qu'un paiement dit de l'argent : ENCAISSÉ, ou pas encore.
//
// Sans Prisma, comme lib/payment-enums.ts et lib/cotisation.ts : ce module se lit
// aussi depuis des composants 'use client'. RECEIVED_PAYMENT_WHERE est un objet
// nu, que les appelants serveur étalent dans leur `where` Prisma.
//
// LA RÈGLE : UN PAIEMENT EST ENCAISSÉ SI ET SEULEMENT SI IL A UNE DATE DE PAIEMENT
//
// Longtemps, toute ligne active a valu « argent reçu », et une date de paiement
// absente retombait sur la date de création — dans summarizeBillPayments, dans
// lib/cotisation.ts, dans le filtre « à jour » des membres. Ce repli rendait
// impossible tout paiement ATTENDU : une demande de paiement (un appel de
// cotisation, par exemple) aurait compté comme réglée — la cotisation « à jour »,
// la facture soldée toute seule, le total de la trésorière gonflé d'argent jamais
// reçu.
//
// La migration 20261119194448_payment_date_backfill a donc daté de leur création
// les quelques paiements qui n'avaient pas de date — exactement la date que le
// repli leur prêtait —, et les routes de saisie font de même tant qu'un paiement
// ne peut pas encore être demandé (voir receivedDateOnSave). Dès lors une date
// absente veut dire « pas encore reçu », et tout ce qui compte de l'argent passe
// par ce module plutôt que par `isActive` seul.
//
// Un lecteur qui additionne, qui dit « à jour » ou « payée » filtre sur
// RECEIVED_PAYMENT_WHERE. Une liste de paiements, elle, les montre tous — ce
// n'est pas la même question.

/** Le `where` Prisma des paiements encaissés — à étaler à côté de `isActive: true`. */
export const RECEIVED_PAYMENT_WHERE = { paymentDate: { not: null } } as const;

/** La même règle, pour une ligne déjà lue. */
export function isPaymentReceived(p: { paymentDate: Date | string | null }): boolean {
    return p.paymentDate != null && p.paymentDate !== '';
}

/**
 * La date de paiement à enregistrer, à la création comme à la modification.
 *
 * Tant que le formulaire ne sait pas encore dire « à demander », un paiement
 * saisi sans date est un encaissement dont on n'a pas noté le jour — ce que le
 * repli de lecture supposait jusqu'ici. On écrit donc la date que ce repli lui
 * aurait prêtée, la date de création, au lieu de laisser une date vide qui
 * voudrait désormais dire « pas encore reçu ». Le jour où un paiement pourra être
 * demandé, c'est ce choix explicite qui laissera la date vide, et cette fonction
 * ne servira plus qu'aux encaissements.
 */
export function receivedDateOnSave(paymentDate: Date | null, creationDate: Date): Date {
    return paymentDate ?? creationDate;
}
