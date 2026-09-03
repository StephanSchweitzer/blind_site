/**
 * Rapprocher deux livres par leur titre.
 *
 * La file des doublons ne peut pas se contenter d'une égalité exacte. Mesuré sur
 * la base de production (412 livres signalés) : l'égalité stricte trouve un autre
 * candidat pour 7 % d'entre eux, la règle de préfixe ci-dessous pour 10 % — et
 * les rapprochements qu'elle ajoute sont ceux que l'import rate systématiquement,
 * parce qu'un côté porte le sous-titre et l'autre non :
 *
 *   « L'ambigu monsieur Macron »  ←→  « L'ambigu Monsieur Macron : Enquête … »
 *   « 45 secondes d'éternité »    ←→  « 45 secondes d'éternité : Mes souvenirs … »
 *   « La médecine des ventouses » ←→  « La médecine des ventouses Tome 2 »
 *
 * Les 87 % restants n'ont aucun candidat, quelle que soit la règle : c'est
 * pourquoi l'écran mène par la recherche libre et n'affiche la liste des
 * suggestions que lorsqu'elle a effectivement quelque chose à montrer.
 */

/**
 * Forme insensible à la casse, aux accents et à la ponctuation.
 *
 * Reprend `normalise` de app/admin/audio-orphelins/page.tsx et de
 * scripts/audio-match-rules.ts — famille d'apostrophes comprise, parce que les
 * outils de synchronisation réécrivent `l’abbé` en `l!abbé`, et que les deux
 * doivent retomber sur la même chaîne.
 */
export function normaliseTitle(v: string): string {
    return v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/['’`"!]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * En deçà, le préfixe ne veut plus rien dire : « Mémoires » est le titre exact de
 * deux livres de la file et le début de bien d'autres. Un titre plus court que
 * cela ne propose donc aucune suggestion — la recherche libre reste ouverte.
 */
export const MIN_TITLE_STEM = 12;

/**
 * Vrai si l'un des deux titres est l'autre, ou l'autre suivi d'un complément.
 *
 * La coupure est exigée sur une frontière de mot : sans cela « la louve blanche »
 * rapprocherait « la louve blanches », qui est un livre différent.
 */
export function titlePrefixMatch(a: string, b: string): boolean {
    const x = normaliseTitle(a);
    const y = normaliseTitle(b);
    if (!x || !y) return false;
    const [short, long] = x.length <= y.length ? [x, y] : [y, x];
    if (short.length < MIN_TITLE_STEM) return false;
    return short === long || long.startsWith(`${short} `);
}
