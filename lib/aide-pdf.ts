import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import type { AideImageResolue } from '@/components/aide/AideGuidePDF';
import { getAllAideSections } from '@/lib/aide';
import { parseAideBlocks } from '@/lib/aide-blocks';
import { dimensionsImage, taillePourBoite } from '@/lib/aide-image-size';

/**
 * Le mode d'emploi en PDF, rendu UNE FOIS PAR DÉPLOIEMENT.
 *
 * Rendu à chaque clic, il prenait ~15 s en production (1,6 s en local) : la
 * fonction Vercel a peu de CPU, et à froid elle doit d'abord charger
 * react-pdf. Or le guide ne change qu'avec un déploiement — `content/aide/`
 * est dans le dépôt — donc chaque clic refaisait exactement le même travail.
 * `pnpm build` le rend désormais d'avance (scripts/build-aide-pdf.ts) et
 * /admin/aide/pdf ne fait plus que servir le fichier.
 *
 * Ce n'est pas une seconde version à tenir à jour : le fichier est refait à
 * chaque build depuis la même source, jamais versionné (`/generated/` est
 * ignoré par git), et ne peut donc pas diverger du guide en ligne déployé
 * avec lui.
 *
 * Hors de `public/` : le guide montre des captures de l'application et doit
 * rester derrière la connexion. Inclus dans la fonction par
 * `outputFileTracingIncludes` (next.config.ts).
 */
export const GUIDE_PDF_PRECONSTRUIT = path.join(process.cwd(), 'generated', 'mode-d-emploi.pdf');

const IMAGES = path.join(process.cwd(), 'content', 'aide', 'images');
// Comme les captures : le rendu tourne côté serveur (Node), pas dans un
// navigateur, donc un `src="/eca_logo_facture.png"` ne se résoudrait pas — il
// faut le binaire. Le même fichier que BillPDF.tsx — le PNG 1000×508 pensé
// pour l'impression, pas le eca_logo.png plus petit utilisé sur le site.
// `public/` et pas `content/aide/images/` : c'est le logotype de
// l'association, pas une capture d'écran du guide.
const LOGO = path.join(process.cwd(), 'public', 'eca_logo_facture.png');
// L'arbre d'Arbre Rose, le même que dans la barre et sur le tableau de bord.
const ARBRE = path.join(process.cwd(), 'public', 'arbre_rose.png');

// A4 : 595 pt de large, 842 de haut ; la page en réserve 48 de chaque côté et
// 54/56 en haut et en bas. Reste 499 pt utiles en largeur. On plafonne la
// hauteur bien en deçà des 732 restants pour qu'une capture n'occupe jamais
// une page à elle seule, titre compris.
const LARGEUR_UTILE = 499;
const HAUTEUR_MAX = 560;

/**
 * Rend le guide complet et renvoie le flux du PDF.
 *
 * react-pdf et le composant sont importés ICI, pas en tête de module : la
 * route qui sert le fichier préconstruit n'a alors pas à les charger au
 * démarrage à froid — ce qui était une bonne part des 15 s.
 */
export async function rendreGuidePdf(dateImpression: string): Promise<Readable> {
    const [{ renderToStream }, { AideGuidePDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/aide/AideGuidePDF'),
    ]);

    const sectionsBrutes = getAllAideSections();
    // Les liens d'une section vers une autre (`[Paiements](/admin/aide/paiements)`)
    // ne deviennent une ancre interne que s'ils pointent une section qui existe
    // réellement — voir resoudreHref dans lib/aide-blocks.ts.
    const slugs = new Set(sectionsBrutes.map((section) => section.slug));
    const sections = sectionsBrutes.map((section) => ({
        slug: section.slug,
        titre: section.title,
        blocs: parseAideBlocks(section.body, slugs),
    }));

    // Ne lire au disque que les captures réellement citées, une seule fois
    // chacune : plusieurs sections peuvent pointer la même.
    const images = new Map<string, AideImageResolue>();
    for (const section of sections) {
        for (const bloc of section.blocs) {
            if (bloc.type !== 'image' || images.has(bloc.fichier)) continue;
            if (!/^[A-Za-z0-9._-]+$/.test(bloc.fichier)) continue;

            const chemin = path.join(IMAGES, bloc.fichier);
            if (!chemin.startsWith(IMAGES) || !fs.existsSync(chemin)) continue;

            const extension = path.extname(bloc.fichier).toLowerCase();
            const format = extension === '.png' ? 'png' : 'jpg';
            const donnees = await fs.promises.readFile(chemin);

            // Une capture dont on ne sait pas lire l'en-tête est écartée
            // plutôt que placée au hasard : elle ferait tomber tout le rendu.
            const brutes = dimensionsImage(donnees, format);
            if (!brutes) continue;
            const taille = taillePourBoite(brutes, LARGEUR_UTILE, HAUTEUR_MAX);

            images.set(bloc.fichier, {
                fichier: bloc.fichier,
                donnees,
                format,
                largeur: taille.largeur,
                hauteur: taille.hauteur,
            });
        }
    }

    const [logo, arbre] = await Promise.all([fs.promises.readFile(LOGO), fs.promises.readFile(ARBRE)]);

    const document = AideGuidePDF({ sections, images, logo, arbre, dateImpression });
    // `renderToStream` est typé `NodeJS.ReadableStream`, l'interface minimale ;
    // il rend en pratique un `Readable`, seul type que `toWeb` accepte.
    return (await renderToStream(document)) as unknown as Readable;
}
