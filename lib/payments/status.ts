// Ce qu'un paiement dit de l'argent : ENCAISSÉ, DEMANDÉ, ou pas encore.
//
// Sans Prisma, comme lib/payment-enums.ts et lib/cotisation.ts : ce module se lit
// aussi depuis des composants 'use client'. Les `where` ci-dessous sont des objets
// nus, que les appelants serveur étalent dans leur `where` Prisma.
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
// repli leur prêtait. Dès lors une date absente veut dire « pas encore reçu », et
// tout ce qui compte de l'argent passe par ce module plutôt que par `isActive`
// seul.
//
// Un lecteur qui additionne, qui dit « à jour » ou « payée » filtre sur
// RECEIVED_PAYMENT_WHERE. Une liste de paiements, elle, les montre tous — ce
// n'est pas la même question.
//
// LE STATUT SE LIT SUR LES DATES, IL N'EST JAMAIS STOCKÉ
//
// Comme une attribution (deriveAssignmentStatus, lib/statusSync.ts) : on saisit
// des dates, le statut suit. Mais là où une demande garde une colonne statutId,
// qu'un permanent peut poser à la main, un paiement n'en a pas — personne n'a
// besoin de dire « encaissé » sans dire quand, et une colonne de plus serait une
// colonne qui finit par contredire les dates. derivePaymentStatus et
// paymentStatusWhere sont les deux moitiés d'une même règle : à changer ensemble.

import { PaymentType } from '@/lib/payment-enums';

export const PaymentStatus = {
    /** Ni demandé ni encaissé : le montant est connu, rien n'est parti. */
    PROFORMA: 'PROFORMA',
    /** La demande est partie (requestDate), l'argent n'est pas arrivé. */
    REQUESTED: 'REQUESTED',
    /** L'argent est arrivé (paymentDate), demandé ou non. */
    RECEIVED: 'RECEIVED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** Dans l'ordre de la vie d'un paiement — l'ordre des étapes et du filtre. */
export const PAYMENT_STATUS_VALUES: readonly PaymentStatus[] = [
    PaymentStatus.PROFORMA,
    PaymentStatus.REQUESTED,
    PaymentStatus.RECEIVED,
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    [PaymentStatus.PROFORMA]: 'Pro-forma',
    [PaymentStatus.REQUESTED]: 'Demandé',
    [PaymentStatus.RECEIVED]: 'Encaissé',
};

// Les couleurs des états de facture (lib/billing-enums.ts) — brouillon, émise,
// payée : les deux cycles se ressemblent, il faut qu'ils se reconnaissent.
const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
    [PaymentStatus.PROFORMA]: 'bg-gray-100 text-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
    [PaymentStatus.REQUESTED]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    [PaymentStatus.RECEIVED]: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

export function getPaymentStatusLabel(status: PaymentStatus): string {
    return PAYMENT_STATUS_LABELS[status] ?? status;
}

export function getPaymentStatusColor(status: PaymentStatus): string {
    return PAYMENT_STATUS_COLORS[status] ?? PAYMENT_STATUS_COLORS.PROFORMA;
}

type DateLike = Date | string | null | undefined;
const isSet = (d: DateLike) => d != null && d !== '';

/** Le statut d'un paiement, lu sur ses deux dates. */
export function derivePaymentStatus(p: { paymentDate: DateLike; requestDate: DateLike }): PaymentStatus {
    if (isSet(p.paymentDate)) return PaymentStatus.RECEIVED;
    if (isSet(p.requestDate)) return PaymentStatus.REQUESTED;
    return PaymentStatus.PROFORMA;
}

/** Le `where` Prisma des paiements encaissés — à étaler à côté de `isActive: true`. */
export const RECEIVED_PAYMENT_WHERE = { paymentDate: { not: null } } as const;

/** Le `where` Prisma d'un statut — la moitié base de données de derivePaymentStatus. */
export function paymentStatusWhere(status: PaymentStatus) {
    switch (status) {
        case PaymentStatus.RECEIVED:
            return RECEIVED_PAYMENT_WHERE;
        case PaymentStatus.REQUESTED:
            return { paymentDate: null, requestDate: { not: null } };
        case PaymentStatus.PROFORMA:
            return { paymentDate: null, requestDate: null };
    }
}

/** La même règle que RECEIVED_PAYMENT_WHERE, pour une ligne déjà lue. */
export function isPaymentReceived(p: { paymentDate: DateLike }): boolean {
    return isSet(p.paymentDate);
}

// ─── Qui peut être demandé ───────────────────────────────────────────────────

/**
 * Les types qu'on peut DEMANDER avant de les encaisser.
 *
 * La cotisation, d'abord : l'appel de cotisation est le cas pour lequel tout ceci
 * existe. « Divers », parce que c'est le fourre-tout des sommes qui ne relèvent
 * d'aucun autre type.
 *
 * Pas l'enregistrement : sa demande de paiement, c'est sa FACTURE — pro-forma en
 * brouillon, demande de règlement une fois émise (lib/billing.ts). Lui donner un
 * second circuit ferait deux documents pour la même somme, qui finiraient par se
 * contredire ; et un paiement attendu n'a rien à faire sur une facture, dont il
 * fausserait le reste à payer. Pas le don non plus : on ne réclame pas un don. Un
 * paiement de ces deux types est donc toujours un encaissement.
 *
 * Partagé par le formulaire et les routes, comme isClientRequiredForPaymentType.
 */
export const PAYMENT_REQUESTABLE_TYPES: readonly PaymentType[] = [PaymentType.COTISATION, PaymentType.DIVERS];

export function isRequestablePaymentType(type: PaymentType): boolean {
    return PAYMENT_REQUESTABLE_TYPES.includes(type);
}

/**
 * La date de paiement à enregistrer, à la création comme à la modification.
 *
 * Un type qu'on ne demande pas (enregistrement, don) est toujours encaissé : saisi
 * sans date, c'est un encaissement dont on n'a pas noté le jour, et il reçoit sa
 * date de création — celle que le repli de lecture lui prêtait avant la règle
 * ci-dessus. Un type qu'on peut demander, lui, garde sa date vide : c'est ce qui
 * le fait « Demandé » ou « Pro-forma ».
 */
export function paymentDateOnSave(type: PaymentType, paymentDate: Date | null, creationDate: Date): Date | null {
    if (paymentDate) return paymentDate;
    return isRequestablePaymentType(type) ? null : creationDate;
}

/**
 * La date de demande à enregistrer : seulement sur un type qu'on demande. Sur les
 * autres, elle se vide, comme cotisationYear hors cotisation — un don « demandé »
 * ne voudrait rien dire.
 */
export function requestDateOnSave(type: PaymentType, requestDate: Date | null): Date | null {
    return isRequestablePaymentType(type) ? requestDate : null;
}
