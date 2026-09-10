/**
 * L'ancre d'un titre du mode d'emploi.
 *
 * À part de `lib/aide.ts` exprès : celui-ci lit le disque (`fs`), et le rendu
 * Markdown qui a besoin des ancres tourne aussi côté client. Une fonction pure
 * ici, la lecture de fichiers là-bas.
 *
 * Volontairement simple et stable : accents repliés, tout ce qui n'est pas
 * alphanumérique devient un tiret. Deux titres identiques dans une même section
 * produiraient la même ancre — le cas ne se présente pas, et s'il se présentait,
 * c'est le titre qu'il faudrait changer, pas l'ancre.
 */
export function slugifyHeading(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[œŒ]/g, 'oe')
        .replace(/[æÆ]/g, 'ae')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
