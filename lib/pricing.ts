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
 * terminer une demande ne fige pas son coût, seule la facture le fait.
 *
 * `billId: null` est le cas NORMAL ici, pas un repli : une demande est tarifée au
 * dépôt de l'audio, bien avant d'être rattachée à un brouillon — c'est la clôture
 * de la demande, plus tard, qui déclenche le rattachement. Voir
 * repriceOpenOrdersForBook.
 *
 * Partagé entre le recalcul à chaud (lib/pricing-sync.ts) et le rattrapage en
 * masse (scripts/backfill-order-costs.ts) : deux définitions de « ajustable »
 * finiraient par diverger.
 */
export const ADJUSTABLE_ORDER_WHERE: Prisma.OrdersWhereInput = {
    isActive: true,
    billingStatus: 'UNBILLED',
    // Une demande tarifée à la page n'a pas de tarif « au poids » : son coût vient
    // de ses pages (pageCostEuros). Avant « Terminé » elle est sur AUCUNE facture,
    // donc exactement dans le cas normal que ce filtre laisse passer — sans cette
    // ligne, le dépôt de l'audio la retarifierait au CD derrière le dos du permanent.
    pages: null,
    OR: [{ billId: null }, { bill: { state: 'DRAFT' } }],
};

/** Prix conseillé d'une page, en euros — modifiable demande par demande. */
export const PRICE_PER_PAGE_EUR = 3;

/** Arrondi au centime, sans passer par des Decimal (ce module reste importable des scripts). */
const toCents = (euros: number): number => Math.round(euros * 100) / 100;

/**
 * Coût d'une demande tarifée à la page : (pages comptées, à défaut pages lues) ×
 * prix par page, plus les frais d'envoi s'il y en a.
 *
 * Aucune règle « 3 pages comptées pour 1 » ici : `billedPages` est saisi. Le
 * rapport varie d'un document à l'autre (42 → 14 pour un numéro de Lumen, 12 → 12
 * pour Colin Maillard), et l'inventer reviendrait à figer une règle que personne
 * n'a énoncée.
 */
export function pageCostEuros(args: {
    pages: number;
    billedPages?: number | null;
    pricePerPage?: number | null;
    transferFee?: number | null;
}): number {
    const counted = args.billedPages ?? args.pages;
    const price = args.pricePerPage ?? PRICE_PER_PAGE_EUR;
    return toCents(counted * price + (args.transferFee ?? 0));
}
