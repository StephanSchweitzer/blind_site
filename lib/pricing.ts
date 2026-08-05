// lib/pricing.ts
// Type-only, therefore erased at build: this module stays importable from the
// standalone scripts, which resolve neither the `@/…` aliases nor a Prisma client.
import type { Prisma } from '@prisma/client';

/**
 * Tarif d'une demande, calculé sur le poids de l'enregistrement.
 *
 * Un CD contient 700 Mio : chaque tranche de 700 Mio entamée coûte un CD de plus.
 * Le tarif reste toujours modifiable à la main — c'est une proposition, pas une
 * contrainte. Elle existe pour éviter les tarifs oubliés sur les gros livres, pas
 * pour retirer la décision au permanent.
 *
 *   0 – 700 Mio   1 CD    3,00 €
 *   1 Gio         2 CD    6,00 €
 *   2,2 Gio       4 CD   12,00 €
 *
 * Un livre sans audio (enregistrement à faire) pèse 0 et retombe donc sur le
 * tarif plancher d'un CD, qui est aussi l'ancien tarif par défaut.
 */

/** Capacité d'un CD, en kibioctets — l'unité de Book.audioSizeKb. */
export const CD_CAPACITY_KB = 700 * 1024;

/** Prix d'un CD entamé, en euros. */
export const PRICE_PER_CD_EUR = 3;

/**
 * Nombre de CD nécessaires pour un poids donné. Toujours au moins 1 : une demande
 * sans audio connu se facture comme un CD, jamais 0 €.
 */
export function cdCount(sizeKb: number | null | undefined): number {
    if (!sizeKb || sizeKb <= 0) return 1;
    return Math.max(1, Math.ceil(sizeKb / CD_CAPACITY_KB));
}

/** Tarif conseillé en euros pour un poids d'enregistrement donné. */
export function suggestedCostEuros(sizeKb: number | null | undefined): number {
    return cdCount(sizeKb) * PRICE_PER_CD_EUR;
}

/** Le même tarif au format du champ « Coût » (« 6.00 »). */
export function suggestedCostValue(sizeKb: number | null | undefined): string {
    return suggestedCostEuros(sizeKb).toFixed(2);
}

/** Poids lisible : « 1,40 Go », « 320,5 Mo », « 48 Ko ». */
export function formatSizeKb(sizeKb: number | null | undefined): string {
    const kb = sizeKb ?? 0;
    if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(2)} Go`;
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} Mo`;
    return `${Math.max(1, Math.round(kb))} Ko`;
}

/**
 * Le tarif conseillé et sa justification, prêts à afficher sous le champ « Coût ».
 * Renvoie null quand le poids n'est pas connu (livre jamais synchronisé), pour
 * que l'interface se taise plutôt que d'annoncer un tarif fondé sur rien.
 */
export function costSuggestion(
    sizeKb: number | null | undefined
): { value: string; euros: number; cds: number; label: string } | null {
    if (sizeKb == null) return null;
    const cds = cdCount(sizeKb);
    const euros = suggestedCostEuros(sizeKb);
    return {
        value: euros.toFixed(2),
        euros,
        cds,
        label: `${formatSizeKb(sizeKb)} — ${cds} CD`,
    };
}

/** Octets renvoyés par le bucket -> kibioctets stockés sur Book.audioSizeKb. */
export function bytesToKb(bytes: number): number {
    return Math.round(bytes / 1024);
}

/**
 * Les demandes dont le tarif peut encore bouger tout seul.
 *
 * « Non facturé », et sur aucune facture ou sur un brouillon. Une facture émise
 * a été imprimée et envoyée ; payée ou soldée, elle est verrouillée. Retarifer
 * l'une des trois derrière le dos du permanent, c'est fabriquer un écart entre
 * le papier et la base — donc on s'arrête au brouillon, et le reste se corrige à
 * la main en rouvrant la facture.
 *
 * Noter que le statut de la demande (« Terminé » compris) n'entre pas en compte :
 * terminer une demande ne fige pas son coût, seule la facture le fait. C'est
 * indispensable ici, parce que l'audio arrive presque toujours APRÈS que
 * l'attribution a terminé la demande — voir repriceOpenOrdersForBook.
 *
 * Partagé entre le recalcul à chaud (lib/pricing-sync.ts) et le rattrapage en
 * masse (scripts/backfill-order-costs.ts) : deux définitions de « ajustable »
 * finiraient par diverger.
 */
export const ADJUSTABLE_ORDER_WHERE: Prisma.OrdersWhereInput = {
    isActive: true,
    billingStatus: 'UNBILLED',
    OR: [{ billId: null }, { bill: { state: 'DRAFT' } }],
};
