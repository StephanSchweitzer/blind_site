// lib/orders/pagePricingForm.ts
// Pur, sans React : importé par les formulaires de demande (édition et création)
// et par le composant PagePricingFields.
import { PRICE_PER_PAGE_EUR, pageCostEuros } from '@/lib/pricing';

/**
 * L'état de la tarification à la page dans un formulaire de demande.
 *
 * Tout est en chaînes, comme les autres champs saisis du formulaire ; la
 * conversion se fait une fois, à l'envoi (pagePricingToPayload). `pageBased`
 * n'existe que côté formulaire : côté serveur, c'est `pages` non nul qui fait la
 * demande « à la page » (voir Orders.pages dans schema.prisma).
 */
export interface PagePricingForm {
    pageBased: boolean;
    pages: string;
    billedPages: string;
    pricePerPage: string;
    transferFee: string;
}

export const emptyPagePricing = (): PagePricingForm => ({
    pageBased: false,
    pages: '',
    billedPages: '',
    pricePerPage: PRICE_PER_PAGE_EUR.toFixed(2),
    transferFee: '',
});

type Numeric = number | string | null | undefined;

/** L'état du formulaire pour une demande existante (ligne du tableau ou réponse de l'API). */
export function pagePricingFromRow(row: {
    pages?: Numeric;
    billedPages?: Numeric;
    pricePerPage?: Numeric;
    transferFee?: Numeric;
}): PagePricingForm {
    const text = (v: Numeric) => (v == null ? '' : String(v));
    const money = (v: Numeric) => (v == null || v === '' ? '' : Number(v).toFixed(2));
    if (row.pages == null) return emptyPagePricing();
    return {
        pageBased: true,
        pages: text(row.pages),
        billedPages: text(row.billedPages),
        pricePerPage: money(row.pricePerPage) || PRICE_PER_PAGE_EUR.toFixed(2),
        transferFee: money(row.transferFee),
    };
}

const toInt = (s: string): number | null => {
    const t = s.trim();
    if (t === '') return null;
    const n = Number(t);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const toMoney = (s: string): number | null => {
    const t = s.trim().replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Ce que le serveur reçoit. Décocher « à la page » envoie quatre `null` : c'est
 * ce qui remet la demande au poids (lib/orders/pagePricing.ts).
 */
export function pagePricingToPayload(f: PagePricingForm) {
    if (!f.pageBased) return { pages: null, billedPages: null, pricePerPage: null, transferFee: null };
    return {
        pages: toInt(f.pages),
        billedPages: toInt(f.billedPages),
        pricePerPage: toMoney(f.pricePerPage) ?? PRICE_PER_PAGE_EUR,
        transferFee: toMoney(f.transferFee),
    };
}

/** Le coût tel que le serveur le dérivera, ou null tant que les pages lues manquent. */
export function livePageCost(f: PagePricingForm): number | null {
    const pages = toInt(f.pages);
    if (!f.pageBased || pages == null) return null;
    return pageCostEuros({
        pages,
        billedPages: toInt(f.billedPages),
        pricePerPage: toMoney(f.pricePerPage) ?? PRICE_PER_PAGE_EUR,
        transferFee: toMoney(f.transferFee),
    });
}

/** Un message d'erreur en français si le formulaire ne peut pas partir, sinon null. */
export function pagePricingError(f: PagePricingForm): string | null {
    if (!f.pageBased) return null;
    if (toInt(f.pages) == null) return 'Renseignez le nombre de pages lues (un entier positif)';
    if (f.billedPages.trim() !== '' && toInt(f.billedPages) == null)
        return 'Le nombre de pages comptées doit être un entier positif';
    if (f.pricePerPage.trim() !== '' && toMoney(f.pricePerPage) == null)
        return 'Le prix par page doit être un montant valide';
    if (f.transferFee.trim() !== '' && toMoney(f.transferFee) == null)
        return "Les frais d'envoi doivent être un montant valide";
    return null;
}

/** Le détail de la ligne de lecture, tel que la pro-forma l'imprime. */
export function describePageCost(f: PagePricingForm): string | null {
    const pages = toInt(f.pages);
    if (!f.pageBased || pages == null) return null;
    const counted = toInt(f.billedPages) ?? pages;
    const price = toMoney(f.pricePerPage) ?? PRICE_PER_PAGE_EUR;
    const fee = toMoney(f.transferFee);
    const eur = (n: number) => n.toFixed(2).replace('.', ',');
    const reading =
        counted !== pages
            ? `${pages} pages, comptées comme ${counted} × ${eur(price)} €`
            : `${pages} page${pages > 1 ? 's' : ''} × ${eur(price)} €`;
    return fee != null && fee > 0 ? `${reading} + ${eur(fee)} € d’envoi` : reading;
}
