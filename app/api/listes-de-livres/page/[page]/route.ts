import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

/**
 * Seules les pages listées au build existent ; tout autre chemin reçoit un 404
 * du routage, sans que la fonction tourne ni que rien soit écrit en cache.
 *
 * Avec des pages générées à la demande, chaque numéro distinct devenait une
 * entrée ISR — `/page/987654` comme `/page/2`, et le 404 d'un chemin parasite
 * aussi (Next met en cache toute réponse d'une route ISR, quel qu'en soit le
 * statut), plus l'entrée de getCoupsDeCoeurPage derrière. Un robot qui
 * énumère les numéros payait autant d'écritures ISR que de numéros.
 */
export const dynamicParams = false;

/**
 * Pages en réserve au-delà des listes actives au moment du build. Une liste
 * créée entre deux déploiements ajoute une page en fin de pagination : elle
 * doit déjà exister. Il s'en crée quelques-unes par an, et le site est déployé
 * bien plus souvent — dix laissent de la marge. Au-delà, la dernière page
 * répondrait 404 jusqu'au déploiement suivant.
 */
const SPARE_PAGES = 10;

export async function generateStaticParams() {
    let pages: number;
    try {
        const lists = await prisma.coupsDeCoeur.count({ where: { active: true } });
        pages = Math.ceil(lists / COUPS_DE_COEUR_PAGE_SIZE) + SPARE_PAGES;
    } catch (error) {
        // Une base injoignable ne doit pas faire échouer le build : une plage
        // large, en attendant le déploiement suivant.
        console.error('listes-de-livres/page: comptage impossible au build', error);
        pages = 50;
    }
    // La page 1 comprise : le navigateur l'a déjà dans le HTML, mais rien ne
    // l'empêche de la redemander.
    return Array.from({ length: pages }, (_, i) => ({ page: String(i + 1) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
    const { page: raw } = await params;
    const page = parsePageParam(raw);
    // Une seule forme par page (« 2 », jamais « 02 » ni « 2abc »). Le routage
    // refuse déjà tout chemin non listé ; ceci garde la même règle en dev.
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
