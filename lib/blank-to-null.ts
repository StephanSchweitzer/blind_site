/**
 * Une colonne texte facultative vide s'écrit null, jamais ''.
 *
 * Les formulaires partent de champs à '' et certains les renvoient tels quels.
 * Une chaîne vide enregistrée n'affiche rien de plus qu'un null, mais la
 * sauvegarde suivante — d'un formulaire qui, lui, envoie null — la « change »,
 * et le journal (/admin/stats) montre alors une ligne fantôme
 * « Sous-titre : (vide) → — » sur une fiche où personne n'a touché au champ.
 *
 * `undefined` reste `undefined` : pour Prisma, c'est « ne touche pas à ce
 * champ », ce qu'un PATCH doit pouvoir continuer à dire. Une valeur non vide est
 * rendue telle quelle, espaces compris.
 */
export function blankToNull(value: string | null | undefined): string | null | undefined;
export function blankToNull(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    return value.trim() === '' ? null : value;
}
