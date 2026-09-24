import { NextRequest, NextResponse } from 'next/server';
import { getCoupsDeCoeurPage, COUPS_DE_COEUR_PAGE_SIZE } from '@/app/(public)/listes-de-livres/data';
import { parsePageParam } from '@/lib/pagination';

/**
 * Une page de /listes-de-livres, pour la pagination côté navigateur.
 *
 * La page publique est servie en statique (page 1 comprise dans le HTML) ; les
 * suivantes arrivent par ici. Même lecture en cache, mêmes champs que ce que
 * la page elle-même envoie — listes actives, livres masqués ou supprimés
 * retirés (data.ts) — donc rien de plus exposé qu'en ouvrant `?page=N`.
 */
export async function GET(request: NextRequest) {
    try {
        const page = parsePageParam(request.nextUrl.searchParams.get('page'));
        const { items, total } = await getCoupsDeCoeurPage(page, COUPS_DE_COEUR_PAGE_SIZE);
        return NextResponse.json({ items, total });
    } catch (error) {
        console.error('Error fetching coups de coeur page:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
