// lib/orders/pagePricing.ts
import { pageCostEuros, PRICE_PER_PAGE_EUR } from '@/lib/pricing';

/**
 * Tarification à la page d'une demande — ce que le formulaire envoie, ce qui en
 * est gardé, et le coût qui en découle.
 *
 * `pages` non nul est LE marqueur d'une demande à la page (voir Orders.pages dans
 * schema.prisma) : tout le reste s'en déduit, il n'y a pas de second drapeau. Le
 * coût est alors DÉRIVÉ et non saisi — un `cost` reçu en même temps est ignoré par
 * l'appelant, pas arbitré ici.
 *
 * Sémantique des entrées : `undefined` = champ non envoyé, on garde l'existant ;
 * `null` ou chaîne vide = on efface. Effacer `pages` efface aussi les trois autres
 * champs : sans pages ils ne veulent rien dire, et un reliquat ferait passer la
 * demande pour tarifée à la page à la première relecture.
 */

export interface PagePricingState {
    pages: number | null;
    billedPages: number | null;
    pricePerPage: number | null;
    transferFee: number | null;
}

export interface PagePricingInput {
    pages?: unknown;
    billedPages?: unknown;
    pricePerPage?: unknown;
    transferFee?: unknown;
}

export type PagePricingResult =
    | {
          ok: true;
          /** Les quatre colonnes à écrire, ou undefined si rien de la tarification n'est touché. */
          write: PagePricingState | undefined;
          /** La demande est (ou reste) tarifée à la page. */
          isPageBased: boolean;
          /** Le coût dérivé, ou null si la demande n'est pas tarifée à la page. */
          cost: number | null;
          /** pages ou billedPages ont bougé : c'est ce qui s'imprime sur la pro-forma. */
          visibleChanged: boolean;
      }
    | { ok: false; httpStatus: number; message: string; field: string };

const isBlank = (v: unknown): boolean => v === null || (typeof v === 'string' && v.trim() === '');

function parseNumber(v: unknown): number {
    return typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
}

/** `undefined` (inchangé) | `null` (effacé) | nombre validé | `'invalid'`. */
function parseOptional(
    v: unknown,
    valid: (n: number) => boolean
): number | null | undefined | 'invalid' {
    if (v === undefined) return undefined;
    if (isBlank(v)) return null;
    const n = parseNumber(v);
    return Number.isFinite(n) && valid(n) ? n : 'invalid';
}

const isPositiveInt = (n: number) => Number.isInteger(n) && n > 0;
const isNonNegative = (n: number) => n >= 0;

export function resolvePagePricing(args: {
    current: PagePricingState;
    input: PagePricingInput;
    /** Le drapeau duplication RÉSULTANT (celui de la demande une fois l'édition appliquée). */
    isDuplication: boolean;
    /** La demande est-elle déjà rattachée à une facture ? */
    billId: number | null;
}): PagePricingResult {
    const { current, input, isDuplication, billId } = args;

    const pages = parseOptional(input.pages, isPositiveInt);
    const billedPages = parseOptional(input.billedPages, isPositiveInt);
    const pricePerPage = parseOptional(input.pricePerPage, isNonNegative);
    const transferFee = parseOptional(input.transferFee, isNonNegative);

    const invalid: [string, unknown, string][] = [
        ['pages', pages, 'Le nombre de pages doit être un entier positif'],
        ['billedPages', billedPages, 'Le nombre de pages comptées doit être un entier positif'],
        ['pricePerPage', pricePerPage, 'Le prix par page doit être un montant positif ou nul'],
        ['transferFee', transferFee, "Les frais d'envoi doivent être un montant positif ou nul"],
    ];
    for (const [field, value, message] of invalid) {
        if (value === 'invalid') return { ok: false, httpStatus: 400, message, field };
    }

    const touched =
        pages !== undefined ||
        billedPages !== undefined ||
        pricePerPage !== undefined ||
        transferFee !== undefined;

    const resultingPages = pages === undefined ? current.pages : (pages as number | null);
    const wasPageBased = current.pages != null;
    const isPageBased = resultingPages != null;

    if (isPageBased && isDuplication) {
        return {
            ok: false,
            httpStatus: 400,
            message: "Une duplication n'est pas tarifée à la page : elle n'a pas de lecture.",
            field: 'pages',
        };
    }

    // Une demande change de nature (au poids ↔ à la page) : sa facture change de
    // nature avec elle, et une facture déjà là ne peut pas l'accompagner. Le chemin
    // de sortie est le même que partout : la détacher d'abord.
    if (billId != null && wasPageBased !== isPageBased) {
        return {
            ok: false,
            httpStatus: 409,
            message:
                'Cette demande est déjà rattachée à une facture : on ne peut plus la faire passer ' +
                "d'une tarification au poids à une tarification à la page (ni l'inverse). " +
                "Détachez-la de sa facture d'abord.",
            field: 'pages',
        };
    }

    if (!isPageBased) {
        // Effacée à l'instant : on vide les quatre colonnes ; sinon rien à écrire.
        const write =
            touched && wasPageBased
                ? { pages: null, billedPages: null, pricePerPage: null, transferFee: null }
                : undefined;
        return { ok: true, write, isPageBased: false, cost: null, visibleChanged: wasPageBased };
    }

    const fee = transferFee === undefined ? current.transferFee : (transferFee as number | null);
    const resulting = {
        pages: resultingPages as number,
        billedPages: billedPages === undefined ? current.billedPages : (billedPages as number | null),
        // Le prix conseillé est FIGÉ sur la demande à la première saisie : changer la
        // constante plus tard ne doit pas retarifer une demande déjà émise.
        pricePerPage:
            (pricePerPage === undefined ? current.pricePerPage : (pricePerPage as number | null)) ??
            PRICE_PER_PAGE_EUR,
        // 0 = gratuit = pas de ligne sur la pro-forma : on ne garde que « nul ».
        transferFee: fee != null && fee > 0 ? fee : null,
    };

    return {
        ok: true,
        write: touched || !wasPageBased ? resulting : undefined,
        isPageBased: true,
        cost: pageCostEuros(resulting),
        visibleChanged:
            resulting.pages !== current.pages || resulting.billedPages !== current.billedPages,
    };
}
