import { NextResponse } from 'next/server';
import { getCoupsDeCoeurPage, COUPS_DE_COEUR_PAGE_SIZE } from '@/app/(public)/listes-de-livres/data';
import { parsePageParam } from '@/lib/pagination';

/**
 * Une page de /listes-de-livres, pour la pagination côté navigateur.
 *
 * La page publique est servie en statique (page 1 comprise dans le HTML) ; les
 * suivantes arrivent par ici. Même lecture en cache, mêmes champs que ce que
 * la page elle-même envoie — listes actives, livres masqués ou supprimés
 * retirés (data.ts) — donc rien de plus exposé qu'en ouvrant `?page=N`.
 *
 * Servie en ISR comme la page elle-même, d'où le numéro dans le chemin et non
 * en `?page=` (une query string rend la route dynamique) : chaque visite
 * préchargeait la page 2, une invocation de fonction par visiteur. La réponse
 * mise en cache porte l'étiquette `coups-de-coeur` de getCoupsDeCoeurPage, que
 * revalidatePublic invalide à chaque modification — jamais plus périmée que la
 * page 1. `revalidate` n'est qu'un filet, comme dans data.ts.
 */
export const revalidate = 86400;

// Aucune page générée au build : chacune l'est à sa première demande, puis
// servie depuis le cache.
export function generateStaticParams() {
    return [];
}

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
    const { page: raw } = await params;
    const page = parsePageParam(raw);
    // Une seule forme par page (« 2 », jamais « 02 » ni « 2abc ») : un chemin
    // parasite reçoit un 404 (mis en cache lui aussi) sans lire la base, au lieu
    // d'une copie de la page 1.
    if (String(page) !== raw) {
        return NextResponse.json({ error: 'Page introuvable' }, { status: 404 });
    }
    try {
        const { items, total } = await getCoupsDeCoeurPage(page, COUPS_DE_COEUR_PAGE_SIZE);
        return NextResponse.json({ items, total });
    } catch (error) {
        console.error('Error fetching coups de coeur page:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
