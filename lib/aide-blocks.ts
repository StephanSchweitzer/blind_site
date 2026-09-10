/**
 * Le Markdown du mode d'emploi, découpé en blocs pour le PDF.
 *
 * `Markdown.tsx` s'appuie sur react-markdown pour l'écran ; react-pdf, lui, ne
 * connaît que des `<Text>` et des `<Image>`. Plutôt que d'embarquer un second
 * moteur Markdown, on découpe ici le sous-ensemble que ces fichiers utilisent
 * réellement — titres, paragraphes, listes, gras, liens, citations, images,
 * un tableau — et le générateur PDF ne fait plus que dessiner.
 *
 * Volontairement pauvre : si une section a besoin d'une construction qui ne
 * figure pas ici, c'est un bloc à ajouter, pas une syntaxe à contourner.
 */

export interface AideRun {
    text: string;
    bold: boolean;
    /** Résolue en absolu — voir SITE_URL — car un PDF n'a pas de base à compléter. */
    url?: string;
}

export type AideBlock =
    | { type: 'titre'; niveau: 2 | 3; texte: string }
    | { type: 'paragraphe'; runs: AideRun[] }
    | { type: 'citation'; runs: AideRun[] }
    | { type: 'liste'; puce: string; runs: AideRun[] }
    | { type: 'image'; fichier: string; alt: string }
    | { type: 'tableau'; lignes: string[][] };

/** Les liens du guide sont tous internes ; un `/admin/...` relatif n'a de sens que sur ce site. */
const SITE_URL = 'https://eca-aveugles.fr';

/** Découpe le gras `**…**` et les liens `[texte](url)`. Le reste de l'inline n'est pas utilisé par le guide. */
export function decouperRuns(ligne: string): AideRun[] {
    const runs: AideRun[] = [];
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let position = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ligne)) !== null) {
        if (m.index > position) {
            runs.push({ text: ligne.slice(position, m.index), bold: false });
        }
        if (m[1] !== undefined) {
            runs.push({ text: m[1], bold: true });
        } else {
            const url = m[3].startsWith('/') ? `${SITE_URL}${m[3]}` : m[3];
            runs.push({ text: m[2], bold: false, url });
        }
        position = m.index + m[0].length;
    }
    if (position < ligne.length) {
        runs.push({ text: ligne.slice(position), bold: false });
    }
    return runs.length ? runs : [{ text: ligne, bold: false }];
}

const IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const TITRE = /^(#{2,3})\s+(.+?)\s*$/;
const CITATION = /^>\s?(.+)$/;
const PUCE = /^[-*]\s+(.+)$/;
const NUMEROTEE = /^(\d+)\.\s+(.+)$/;
const SEPARATEUR_TABLEAU = /^\|?\s*:?-{2,}/;

export function parseAideBlocks(corps: string): AideBlock[] {
    const blocs: AideBlock[] = [];
    const lignes = corps.split(/\r?\n/);

    for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i].trim();
        if (!ligne) continue;

        const image = IMAGE.exec(ligne);
        if (image) {
            // Le chemin est celui de la route gardée (/admin/aide/images/x.jpg) :
            // pour le PDF on ne garde que le nom du fichier, lu au disque.
            blocs.push({
                type: 'image',
                alt: image[1],
                fichier: image[2].split('/').pop() ?? '',
            });
            continue;
        }

        const titre = TITRE.exec(ligne);
        if (titre) {
            blocs.push({
                type: 'titre',
                niveau: titre[1].length === 2 ? 2 : 3,
                texte: titre[2].replace(/\*\*/g, ''),
            });
            continue;
        }

        // Un tableau : ligne d'en-têtes, séparateur, puis les lignes.
        if (ligne.startsWith('|') && SEPARATEUR_TABLEAU.test((lignes[i + 1] ?? '').trim())) {
            const cellules = (l: string) =>
                l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
                    .map((c) => c.trim().replace(/\*\*/g, ''));
            const tableau: string[][] = [cellules(ligne)];
            i += 2;
            while (i < lignes.length && lignes[i].trim().startsWith('|')) {
                tableau.push(cellules(lignes[i]));
                i++;
            }
            i--;
            blocs.push({ type: 'tableau', lignes: tableau });
            continue;
        }

        const citation = CITATION.exec(ligne);
        if (citation) {
            blocs.push({ type: 'citation', runs: decouperRuns(citation[1]) });
            continue;
        }

        const puce = PUCE.exec(ligne);
        if (puce) {
            blocs.push({ type: 'liste', puce: '•', runs: decouperRuns(puce[1]) });
            continue;
        }

        const numerotee = NUMEROTEE.exec(ligne);
        if (numerotee) {
            blocs.push({
                type: 'liste',
                puce: `${numerotee[1]}.`,
                runs: decouperRuns(numerotee[2]),
            });
            continue;
        }

        blocs.push({ type: 'paragraphe', runs: decouperRuns(ligne) });
    }

    return blocs;
}
