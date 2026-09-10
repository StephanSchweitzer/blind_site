import fs from 'fs';
import path from 'path';

import { slugifyHeading } from './aide-slug';

/**
 * Le mode d'emploi, lu depuis `content/aide/*.md`.
 *
 * Une seule source, deux sorties : la section d'aide dans /admin/aide et le
 * guide imprimable remis aux nouveaux permanents. Le PDF d'origine
 * (user_guide/) est figé — on ne l'édite plus, on ne le lit plus d'ici.
 *
 * Les ancres se prennent sur les titres, JAMAIS sur des numéros de page : un
 * titre survit à une modification du texte, un numéro de page non. C'est toute
 * la raison pour laquelle les boutons « Aide » pointent ici et pas dans un PDF.
 */

const AIDE_DIR = path.join(process.cwd(), 'content', 'aide');

export interface AideHeading {
    /** Niveau du titre : 2 pour `##`, 3 pour `###`. */
    level: number;
    text: string;
    /** L'ancre, dérivée du texte — voir slugifyHeading. */
    id: string;
}

export interface AideSectionMeta {
    slug: string;
    title: string;
    order: number;
}

export interface AideSection extends AideSectionMeta {
    /** Le corps, en-tête YAML et titre H1 retirés. */
    body: string;
    headings: AideHeading[];
}

export { slugifyHeading } from './aide-slug';

/** En-tête YAML minimal : trois clés, valeurs scalaires. Pas de dépendance pour ça. */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    if (!match) return { data: {}, body: raw };

    const data: Record<string, string> = {};
    for (const line of match[1].split(/\r?\n/)) {
        const sep = line.indexOf(':');
        if (sep === -1) continue;
        data[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
    return { data, body: raw.slice(match[0].length) };
}

/**
 * Le H1 d'ouverture, retiré : la page rend déjà son propre en-tête, et le
 * laisser afficherait le titre deux fois de suite.
 */
function stripLeadingH1(body: string): string {
    return body.replace(/^\s*#\s+.*(\r?\n)+/, '');
}

function extractHeadings(body: string): AideHeading[] {
    const headings: AideHeading[] = [];
    // Les blocs de code n'existent pas dans ce contenu (des captures et de la
    // prose), donc pas besoin de les esquiver ici.
    const re = /^(#{2,3})\s+(.+?)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        const text = m[2].replace(/\*\*/g, '').trim();
        headings.push({ level: m[1].length, text, id: slugifyHeading(text) });
    }
    return headings;
}

function readSectionFile(file: string): AideSection | null {
    const raw = fs.readFileSync(path.join(AIDE_DIR, file), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    if (!data.slug || !data.title) return null;

    const cleaned = stripLeadingH1(body);
    return {
        slug: data.slug,
        title: data.title,
        order: Number(data.order) || 0,
        body: cleaned,
        headings: extractHeadings(cleaned),
    };
}

function listFiles(): string[] {
    if (!fs.existsSync(AIDE_DIR)) return [];
    return fs.readdirSync(AIDE_DIR).filter((f) => f.endsWith('.md')).sort();
}

/** Toutes les sections, dans l'ordre du guide. Sans les corps : pour les sommaires. */
export function listAideSections(): AideSectionMeta[] {
    return listFiles()
        .map(readSectionFile)
        .filter((s): s is AideSection => s !== null)
        .sort((a, b) => a.order - b.order)
        .map(({ slug, title, order }) => ({ slug, title, order }));
}

/** Une section par son slug, ou null si elle n'existe pas. */
export function getAideSection(slug: string): AideSection | null {
    for (const file of listFiles()) {
        const section = readSectionFile(file);
        if (section?.slug === slug) return section;
    }
    return null;
}

/** Toutes les sections, corps compris, dans l'ordre du guide — pour le PDF. */
export function getAllAideSections(): AideSection[] {
    return listFiles()
        .map(readSectionFile)
        .filter((s): s is AideSection => s !== null)
        .sort((a, b) => a.order - b.order);
}

/** Les voisines dans le guide, pour la navigation en bas de page. */
export function getAideNeighbours(slug: string): {
    previous: AideSectionMeta | null;
    next: AideSectionMeta | null;
} {
    const all = listAideSections();
    const i = all.findIndex((s) => s.slug === slug);
    if (i === -1) return { previous: null, next: null };
    return {
        previous: i > 0 ? all[i - 1] : null,
        next: i < all.length - 1 ? all[i + 1] : null,
    };
}
