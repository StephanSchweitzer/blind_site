/**
 * Rend le mode d'emploi en PDF, une fois, avant `next build`.
 *
 * Lancé par `pnpm build` : le fichier part dans `generated/`, que
 * next.config.ts inclut dans la fonction de /admin/aide/pdf. Pourquoi au
 * build plutôt qu'à chaque clic : voir lib/aide-pdf.ts.
 *
 * Un échec ici fait échouer le build, exprès : un déploiement dont le guide
 * ne se rend pas est un déploiement dont le bouton « Télécharger en PDF » ne
 * marche pas, et mieux vaut l'apprendre avant la mise en ligne.
 *
 * Usage : pnpm aide:pdf (ou via pnpm build)
 */
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

import { GUIDE_PDF_PRECONSTRUIT, rendreGuidePdf } from '../lib/aide-pdf';
import { parisDate } from '../lib/paris-day';

async function main() {
    const debut = performance.now();
    await fs.promises.mkdir(path.dirname(GUIDE_PDF_PRECONSTRUIT), { recursive: true });

    // L'« édition du » imprimée sur la couverture est donc le jour du build :
    // celui où cette version du guide a été mise en ligne.
    const flux = await rendreGuidePdf(parisDate(new Date()));
    await pipeline(flux, fs.createWriteStream(GUIDE_PDF_PRECONSTRUIT));

    const { size } = await fs.promises.stat(GUIDE_PDF_PRECONSTRUIT);
    const duree = ((performance.now() - debut) / 1000).toFixed(1);
    console.log(
        `Mode d'emploi : ${path.relative(process.cwd(), GUIDE_PDF_PRECONSTRUIT)} ` +
            `(${(size / 1e6).toFixed(1)} Mo, ${duree} s)`,
    );
}

main().catch((erreur) => {
    console.error("Le mode d'emploi n'a pas pu être rendu en PDF :", erreur);
    process.exit(1);
});
