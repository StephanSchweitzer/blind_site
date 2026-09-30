import fs from 'fs';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';
import { GUIDE_PDF_PRECONSTRUIT, rendreGuidePdf } from '@/lib/aide-pdf';
import { parisDate } from '@/lib/paris-day';

/**
 * Le mode d'emploi complet, en un PDF téléchargeable.
 *
 * En production, le fichier est celui que `pnpm build` a rendu depuis
 * `content/aide/*.md` — la même source que /admin/aide, au même déploiement.
 * Pourquoi d'avance et pas à la demande : voir lib/aide-pdf.ts.
 *
 * En développement, il est rendu à chaque appel : le Markdown y change sans
 * build, et un fichier laissé par un `pnpm build` antérieur serait périmé.
 * Même repli en production si le fichier manque — plus lent, mais le bouton
 * répond.
 *
 * `withAuth` et non `withAdmin` : le guide s'adresse à quiconque peut ouvrir
 * /admin. Il montre des captures d'écran de l'application, ce qui suffit à le
 * garder derrière la connexion.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Le repli, lui, rend le guide : sans valeur explicite, Vercel coupe à sa
// limite par défaut (10 s) et le bouton reçoit un 504 — c'est ce qui arrivait
// avant le rendu au build.
export const maxDuration = 60;

export const GET = withAuth(async () => {
    const preconstruit =
        process.env.NODE_ENV === 'production' && fs.existsSync(GUIDE_PDF_PRECONSTRUIT);
    if (!preconstruit && process.env.NODE_ENV === 'production') {
        console.warn(`[aide/pdf] ${GUIDE_PDF_PRECONSTRUIT} absent : rendu à la demande.`);
    }

    /**
     * EN FLUX, ET C'EST LA RAISON D'ÊTRE DE CE DÉTOUR.
     *
     * Sur Vercel, le corps d'une réponse de fonction est PLAFONNÉ À 4,5 Mo ; le
     * guide en pèse une dizaine. Renvoyé d'un bloc, le bouton « Télécharger en
     * PDF » répondait une erreur au lieu d'un fichier. Une réponse diffusée n'a
     * pas ce plafond — que le fichier soit lu au disque ou rendu à la volée.
     *
     * Pas de `Content-Length` : sur le repli, la taille n'est pas connue avant
     * d'avoir tout rendu, et l'annoncer fausse ferait couper le téléchargement.
     *
     * Ce plafond se rappellera au bon souvenir de qui ajoutera des captures :
     * le PDF pèse à peu près ce que pèse `content/aide/images/`, react-pdf
     * embarquant les JPEG tels quels sans les redécoder. `pnpm aide:optimize`
     * tient ce poids ; le flux fait qu'il ne casse plus rien s'il remonte.
     */
    const flux = preconstruit
        ? fs.createReadStream(GUIDE_PDF_PRECONSTRUIT)
        : await rendreGuidePdf(parisDate(new Date()));

    const jour = new Date().toISOString().slice(0, 10);
    return new NextResponse(Readable.toWeb(flux) as ReadableStream<Uint8Array>, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="mode-d-emploi-arbre-rose-${jour}.pdf"`,
            // Le fichier change à chaque déploiement : aucun cache, partagé ou
            // non, qui servirait l'ancien guide après une mise en ligne.
            'Cache-Control': 'no-store',
        },
    });
});
