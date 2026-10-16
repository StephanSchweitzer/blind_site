import { hyphenateSync } from 'hyphen/fr';

/**
 * Coupure des mots en fin de ligne, pour les PDF de react-pdf.
 *
 * Sans consigne, react-pdf coupe avec les motifs anglais (textkit charge
 * `hyphen/patterns/en-us`) : la liste de livres imprimait « simplic-ité »,
 * « sex-ualité ». On lui passe ces motifs français Text par Text
 * (`hyphenationCallback`), jamais par `Font.registerHyphenationCallback`, qui
 * vaut pour tous les PDF du site — la facture et les étiquettes comprises,
 * selon celui qui a été imprimé le premier (voir MailingLabelPDF).
 */

const SOFT_HYPHEN = '­';
// Les minimums de la typographie française (ceux de babel-french) : deux
// lettres au moins avant le tiret, trois reportées sur la ligne suivante —
// « simplici-té » est permis par les motifs, pas par l'usage.
const LEFT_MIN = 2;
const RIGHT_MIN = 3;

const letterCount = (part: string) => part.match(/\p{L}/gu)?.length ?? 0;

const cache = new Map<string, string[]>();

/** Les morceaux entre lesquels le mot peut être coupé ; joints, ils redonnent le mot. */
export const hyphenateFr = (word: string): string[] => {
    const cached = cache.get(word);
    if (cached) return cached;

    // Une coupure posée à la main (trait d'union conditionnel) l'emporte, comme
    // dans le moteur par défaut de react-pdf.
    const marked = word.includes(SOFT_HYPHEN) ? word : hyphenateSync(word, { hyphenChar: SOFT_HYPHEN });
    const parts = marked.split(SOFT_HYPHEN);
    while (parts.length > 1 && letterCount(parts[0]) < LEFT_MIN) {
        parts.splice(0, 2, parts[0] + parts[1]);
    }
    while (parts.length > 1 && letterCount(parts[parts.length - 1]) < RIGHT_MIN) {
        parts.splice(-2, 2, parts[parts.length - 2] + parts[parts.length - 1]);
    }

    cache.set(word, parts);
    return parts;
};

/** Pour les noms propres et les titres : un mot ne se coupe jamais. */
export const noHyphenation = (word: string): string[] => [word];
