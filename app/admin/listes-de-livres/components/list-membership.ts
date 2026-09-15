/** Une liste de livres qui contient déjà un livre donné. */
export interface ListRef {
    id: number;
    title: string;
    active: boolean;
}

/**
 * L'avertissement porté par une ligne : « Déjà dans « X » ».
 *
 * Une seule liste est nommée, la plus récente — les autres se comptent. Une
 * liste masquée est dite masquée : sans quoi le permanent irait vérifier
 * sur le site, n'y trouverait rien, et conclurait à une erreur.
 */
export function membershipLabel(refs: ListRef[]): string {
    const [first, ...rest] = refs;
    const name = `« ${first.title} »${first.active ? '' : ' (masquée)'}`;
    if (rest.length === 0) return `Déjà dans ${name}`;
    return `Déjà dans ${name} et ${rest.length} autre${rest.length > 1 ? 's' : ''} liste${rest.length > 1 ? 's' : ''}`;
}
