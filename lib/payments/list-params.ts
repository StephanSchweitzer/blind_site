import { PaymentType, PaymentMethod } from '@/lib/payment-enums';
import { isParisDay } from '@/lib/paris-day';

/**
 * Les paramètres de la liste des paiements — la moitié CLIENT.
 *
 * Séparée de `list-query.ts` pour une raison mécanique : ce module est importé
 * par `payments-table.tsx`, un composant `'use client'`. Tout ce qu'il touche
 * part donc dans le bundle du navigateur, et `@prisma/client` n'y entre pas —
 * il tire `node:module` et le build casse net sur « the chunking context does
 * not support external modules ». C'est la même précaution que documente
 * `lib/payment-enums.ts`, d'où viennent les enums utilisés ici plutôt que de
 * `@prisma/client` : mêmes valeurs, sans le runtime.
 *
 * La construction du `where` et du `orderBy`, elle, a besoin de Prisma et reste
 * dans `list-query.ts`, côté serveur.
 */

export const PAYMENT_SORT_FIELDS = ['creationDate', 'paymentDate', 'amount', 'id'] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

/**
 * La date sur laquelle porte l'intervalle, au choix.
 *
 * Les deux questions sont posées pour de bon et n'ont pas la même réponse :
 * « qu'a-t-on SAISI en janvier » se lit sur la date de création, « qu'a-t-on
 * ENCAISSÉ en janvier » — celle d'une trésorière devant un relevé bancaire — sur
 * la date de paiement. Un seul filtre codé sur l'une des deux aurait rendu
 * l'autre impossible.
 */
export const PAYMENT_DATE_FIELDS = ['creationDate', 'paymentDate'] as const;
export type PaymentDateField = (typeof PAYMENT_DATE_FIELDS)[number];

export type SortDirection = 'asc' | 'desc';

export interface PaymentListParams {
    search: string;
    type?: PaymentType;
    paymentMethod?: PaymentMethod;
    clientId?: number;
    /** Bornes en jour PARISIEN ('YYYY-MM-DD'), inclusives des deux côtés. */
    from?: string;
    to?: string;
    dateField: PaymentDateField;
    /** Enregistrements qu'aucune facture ne réclame — la file de rapprochement. */
    unlinked: boolean;
    /** Paiements jamais affectés (`isAllocated` faux ou jamais renseigné). */
    unallocated: boolean;
    sort: PaymentSortField;
    dir: SortDirection;
    includeInactive: boolean;
}

export const DEFAULT_PAYMENT_SORT: PaymentSortField = 'creationDate';
export const DEFAULT_PAYMENT_DIR: SortDirection = 'desc';

/** Les valeurs par défaut, pour savoir si un filtre est posé (bouton « Réinitialiser »). */
export function isDefaultPaymentFilters(p: PaymentListParams): boolean {
    return (
        !p.search &&
        !p.type &&
        !p.paymentMethod &&
        !p.from &&
        !p.to &&
        !p.unlinked &&
        !p.unallocated &&
        p.sort === DEFAULT_PAYMENT_SORT &&
        p.dir === DEFAULT_PAYMENT_DIR
    );
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

/**
 * Un même lecteur pour les deux formes de paramètres : `URLSearchParams` côté
 * route, l'objet `searchParams` côté page serveur. Sans quoi il faudrait deux
 * fonctions de parsing, donc deux occasions de lire un paramètre différemment.
 */
function reader(source: ParamSource): (key: string) => string | undefined {
    if (source instanceof URLSearchParams) {
        return (key) => source.get(key) ?? undefined;
    }
    return (key) => {
        const raw = source[key];
        return Array.isArray(raw) ? raw[0] : raw;
    };
}

const isOn = (value: string | undefined) => value === 'true' || value === '1';

function enumParam<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parsePaymentListParams(
    source: ParamSource,
    overrides: { clientId?: number } = {}
): PaymentListParams {
    const get = reader(source);

    const rawClientId = get('clientId');
    const parsedClientId = rawClientId ? parseInt(rawClientId, 10) : NaN;

    const from = get('from');
    const to = get('to');

    return {
        search: get('search') || '',
        type: enumParam(get('type'), Object.values(PaymentType)),
        paymentMethod: enumParam(get('paymentMethod'), Object.values(PaymentMethod)),
        clientId: overrides.clientId ?? (Number.isInteger(parsedClientId) ? parsedClientId : undefined),
        from: isParisDay(from) ? from : undefined,
        to: isParisDay(to) ? to : undefined,
        dateField: enumParam(get('dateField'), PAYMENT_DATE_FIELDS) ?? 'creationDate',
        unlinked: isOn(get('unlinked')),
        unallocated: isOn(get('unallocated')),
        sort: enumParam(get('sort'), PAYMENT_SORT_FIELDS) ?? DEFAULT_PAYMENT_SORT,
        dir: get('dir') === 'asc' ? 'asc' : DEFAULT_PAYMENT_DIR,
        includeInactive: isOn(get('includeInactive')),
    };
}
