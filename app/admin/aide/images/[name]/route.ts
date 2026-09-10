import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';

/**
 * Sert les captures du mode d'emploi, derriere l'authentification.
 *
 * Elles vivaient dans `public/aide/`. Or `public/` n'est PAS couvert par le
 * matcher de middleware.ts (`/admin/:path*`, `/auth/change-password`,
 * `/profile`) : n'importe qui connaissant l'URL pouvait donc les telecharger,
 * sans compte. Les captures sont expurgees (scripts/redact-aide-screenshots.py),
 * mais l'expurgation depend d'un OCR qui ne lit pas tout — on ne fait donc pas
 * reposer la confidentialite sur elle seule. Le fichier sort maintenant de
 * `content/aide/images/`, hors du dossier public, et ne s'obtient qu'ici.
 *
 * Volontairement `withAuth` et non `withAdmin` : le mode d'emploi s'adresse a
 * toute personne qui peut ouvrir /admin, et la page qui l'affiche a deja passe
 * le middleware.
 */
const DOSSIER = path.join(process.cwd(), 'content', 'aide', 'images');

const TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};

export const GET = withAuth(async (request, { params }) => {
    const { name } = (await params) as { name: string };

    // Le nom vient de l'URL : on n'accepte qu'un fichier simple, jamais un
    // chemin. Sans cela, « ..%2F..%2F.env » sortirait du dossier.
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) {
        return NextResponse.json({ message: 'Nom de fichier invalide' }, { status: 400 });
    }

    const extension = path.extname(name).toLowerCase();
    const type = TYPES[extension];
    if (!type) {
        return NextResponse.json({ message: 'Type non servi' }, { status: 400 });
    }

    const chemin = path.join(DOSSIER, name);
    if (!chemin.startsWith(DOSSIER) || !fs.existsSync(chemin)) {
        return NextResponse.json({ message: 'Capture introuvable' }, { status: 404 });
    }

    /**
     * Un ETag, et la capture ne repart pas deux fois.
     *
     * Le nom d'une capture ne change PAS quand son contenu change : `pnpm
     * aide:shots` réécrit factures-01.jpg par-dessus l'ancienne. Impossible
     * donc de la déclarer `immutable` — un permanent garderait une image
     * périmée pendant toute la durée du cache, et le guide lui montrerait une
     * interface qui n'existe plus.
     *
     * La taille et la date de modification donnent une empreinte qui suit le
     * fichier : tant qu'elle ne bouge pas, le navigateur revalide et reçoit un
     * 304 vide au lieu des cent kilo-octets. Dès qu'on recapture, l'empreinte
     * change et l'image repart. On garde le cache court pour la même raison,
     * `stale-while-revalidate` évitant l'attente au moment où il expire.
     */
    const infos = await fs.promises.stat(chemin);
    const empreinte = `"${infos.size.toString(16)}-${infos.mtimeMs.toString(16)}"`;

    const enTetes = {
        'Content-Type': type,
        ETag: empreinte,
        // Privee : la reponse depend de la session, aucun cache partage ne
        // doit la retenir. Le navigateur, lui, peut la garder une heure.
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
    };

    if (request.headers.get('if-none-match') === empreinte) {
        return new NextResponse(null, { status: 304, headers: enTetes });
    }

    const fichier = await fs.promises.readFile(chemin);
    return new NextResponse(new Uint8Array(fichier), {
        headers: { ...enTetes, 'Content-Length': String(fichier.length) },
    });
});
