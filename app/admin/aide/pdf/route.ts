import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
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

// A4 : 595 pt de large, 842 de haut ; la page en réserve 48 de chaque côté et
// 54/56 en haut et en bas. Reste 499 pt utiles en largeur. On plafonne la
// hauteur bien en deçà des 732 restants pour qu'une capture n'occupe jamais
// une page à elle seule, titre compris.
const LARGEUR_UTILE = 499;
const HAUTEUR_MAX = 560;

export const GET = withAuth(async () => {
    const sections = getAllAideSections().map((section) => ({
        titre: section.title,
        blocs: parseAideBlocks(section.body),
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

    const document = AideGuidePDF({
        sections,
        images,
        dateImpression: parisDate(new Date()),
    });
    const pdf = await renderToBuffer(document);

    const jour = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pdf), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(pdf.length),
            'Content-Disposition': `attachment; filename="mode-d-emploi-arbre-rose-${jour}.pdf"`,
            // Engendré à chaque appel : c'est ce qui garantit qu'il colle au
            // guide en ligne. Aucun cache, partagé ou non.
            'Cache-Control': 'no-store',
        },
    });
});
