import fs from 'fs';
import path from 'path';
import { dimensionsImage, type Dimensions } from './aide-image-size';

/**
 * Les captures citées par une section, avec leurs dimensions réelles.
 *
 * Deux choses en dépendent, et les deux comptent au chargement :
 *
 *   * `width` / `height` sur le `<img>`. Sans eux, le navigateur ne connaît la
 *     place d'une capture qu'une fois l'octet arrivé : le texte se recompose
 *     sous les yeux du lecteur à chaque image chargée. Avec eux, la place est
 *     réservée d'emblée et la page ne bouge plus.
 *   * Le `preload` de la PREMIÈRE capture. Le navigateur ne découvre une image
 *     qu'en lisant le `<img>` qui la porte ; l'annoncer dans l'en-tête fait
 *     partir la requête pendant qu'il lit encore le HTML.
 *
 * Lecture au disque, mais à la COMPILATION : /admin/aide/[slug] est prérendu
 * (`generateStaticParams`), donc ceci ne s'exécute pas à la visite. Seuls
 * quelques octets d'en-tête sont lus par capture — pas de décodage.
 */
const DOSSIER = path.join(process.cwd(), 'content', 'aide', 'images');

/** `![légende](/admin/aide/images/factures-01.jpg)` */
const IMAGE_MARKDOWN = /!\[[^\]]*\]\(\/admin\/aide\/images\/([A-Za-z0-9._-]+)\)/g;

export interface CaptureMesuree extends Dimensions {
    /** L'URL telle qu'elle figure dans le Markdown, pour s'y retrouver au rendu. */
    src: string;
}

function mesurer(fichier: string): Dimensions | null {
    const extension = path.extname(fichier).toLowerCase();
    if (extension !== '.jpg' && extension !== '.jpeg' && extension !== '.png') return null;

    const chemin = path.join(DOSSIER, fichier);
    // Le nom vient du Markdown du dépôt, mais on ne sort pas du dossier pour
    // autant : une faute de frappe ne doit pas devenir une lecture arbitraire.
    if (!chemin.startsWith(DOSSIER) || !fs.existsSync(chemin)) return null;

    // 64 Ko couvrent largement l'en-tête d'un JPEG progressif ; inutile de
    // charger une capture entière pour y lire deux entiers.
    const descripteur = fs.openSync(chemin, 'r');
    try {
        const tampon = Buffer.alloc(65536);
        const lus = fs.readSync(descripteur, tampon, 0, tampon.length, 0);
        return dimensionsImage(tampon.subarray(0, lus), extension === '.png' ? 'png' : 'jpg');
    } finally {
        fs.closeSync(descripteur);
    }
}

/**
 * Dans l'ORDRE du texte : la première de la liste est celle que le lecteur
 * verra en premier, donc celle qu'on précharge.
 */
export function capturesDeLaSection(corps: string): CaptureMesuree[] {
    const vues = new Set<string>();
    const captures: CaptureMesuree[] = [];

    for (const [, fichier] of corps.matchAll(IMAGE_MARKDOWN)) {
        if (vues.has(fichier)) continue;
        vues.add(fichier);

        const taille = mesurer(fichier);
        // Une capture qu'on ne sait pas mesurer s'affiche quand même : elle
        // perd la réservation de place, pas son image.
        if (!taille) continue;
        captures.push({ src: `/admin/aide/images/${fichier}`, ...taille });
    }

    return captures;
}
