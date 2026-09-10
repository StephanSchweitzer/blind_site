import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { withAuth } from '@/lib/auth/guards';
import { getAllAideSections } from '@/lib/aide';
import { parseAideBlocks } from '@/lib/aide-blocks';
import { AideGuidePDF, type AideImageResolue } from '@/components/aide/AideGuidePDF';
import { parisDate } from '@/lib/paris-day';
import { dimensionsImage, taillePourBoite } from '@/lib/aide-image-size';

/**
 * Le mode d'emploi complet, en un PDF téléchargeable.
 *
 * Engendré à la demande depuis `content/aide/*.md` — la même source que
 * /admin/aide. Rien n'est stocké : un fichier posé quelque part serait une
 * seconde version à tenir à jour, c'est-à-dire une version fausse tôt ou tard.
 *
 * `withAuth` et non `withAdmin` : le guide s'adresse à quiconque peut ouvrir
 * /admin. Il montre des captures d'écran de l'application, ce qui suffit à le
 * garder derrière la connexion.
 *
 * Le rendu prend quelques secondes — une centaine de captures y passent — d'où
 * un bouton explicite plutôt qu'un lien qu'on croirait instantané.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMAGES = path.join(process.cwd(), 'content', 'aide', 'images');
// Comme les captures : le rendu tourne côté serveur (Node), pas dans un
// navigateur, donc un `src="/eca_logo.png"` ne se résoudrait pas — il faut le
// binaire. `public/` et pas `content/aide/images/` : c'est le logotype de
// l'association, pas une capture d'écran du guide.
const LOGO = path.join(process.cwd(), 'public', 'eca_logo.png');

// A4 : 595 pt de large, 842 de haut ; la page en réserve 48 de chaque côté et
// 54/56 en haut et en bas. Reste 499 pt utiles en largeur. On plafonne la
// hauteur bien en deçà des 732 restants pour qu'une capture n'occupe jamais
// une page à elle seule, titre compris.
const LARGEUR_UTILE = 499;
const HAUTEUR_MAX = 560;

export const GET = withAuth(async () => {
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

    const logo = await fs.promises.readFile(LOGO);

    const document = AideGuidePDF({
        sections,
        images,
        logo,
        dateImpression: parisDate(new Date()),
    });
    /**
     * EN FLUX, ET C'EST LA RAISON D'ÊTRE DE CE DÉTOUR.
     *
     * `renderToBuffer` rendait le guide entier en mémoire puis le renvoyait
     * d'un bloc. En local cela marche — c'est ce qui a longtemps caché le
     * problème. Sur Vercel, le corps d'une réponse de fonction est PLAFONNÉ À
     * 4,5 Mo : le guide en pesait 11,3, et le bouton « Exporter en PDF »
     * répondait une erreur au lieu d'un fichier.
     *
     * Une réponse diffusée n'a pas ce plafond. Le PDF part par morceaux, à
     * mesure que react-pdf les produit — ce qui supprime au passage le pic de
     * mémoire du tampon complet.
     *
     * Pas de `Content-Length` : la taille n'est pas connue avant d'avoir tout
     * rendu, et l'annoncer fausse ferait couper le téléchargement. Le fichier
     * arrive donc sans jauge de progression ; c'est le prix, et il se voit à
     * peine sur quelques secondes.
     *
     * Ce plafond se rappellera au bon souvenir de qui ajoutera des captures :
     * le PDF pèse à peu près ce que pèse `content/aide/images/`, react-pdf
     * embarquant les JPEG tels quels sans les redécoder. `pnpm aide:optimize`
     * tient ce poids ; le flux fait qu'il ne casse plus rien s'il remonte.
     */
    // `renderToStream` est typé `NodeJS.ReadableStream`, l'interface minimale ;
    // il rend en pratique un `Readable`, seul type que `toWeb` accepte.
    const flux = (await renderToStream(document)) as unknown as Readable;

    const jour = new Date().toISOString().slice(0, 10);
    return new NextResponse(Readable.toWeb(flux) as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="mode-d-emploi-arbre-rose-${jour}.pdf"`,
            // Engendré à chaque appel : c'est ce qui garantit qu'il colle au
            // guide en ligne. Aucun cache, partagé ou non.
            'Cache-Control': 'no-store',
        },
    });
});
