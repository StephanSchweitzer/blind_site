import CoupsDeCoeurClient from './CoupsDeCoeurClient';
import { getCoupsDeCoeurPage, COUPS_DE_COEUR_PAGE_SIZE } from './data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Listes de livres',
    description: 'Découvrez les listes de livres et recommandations de lecture sélectionnées par les ECA.',
    alternates: { canonical: '/listes-de-livres' },
};

// Statique, comme le catalogue et les dernières infos : sans `searchParams`,
// la page part du cache et les liens du menu la préchargent en entier — plus
// d'écran « Chargement… » en y arrivant. `?page=N` est lu dans le navigateur
// (CoupsDeCoeurClient). L'invalidation par le tag `coups-de-coeur` la
// régénère après chaque modification ; ce délai n'est qu'un filet.
export const revalidate = 3600;

export default async function CoupsDeCoeurPage() {
    const { items, total } = await getCoupsDeCoeurPage(1, COUPS_DE_COEUR_PAGE_SIZE);

    return <CoupsDeCoeurClient initialContent={items} initialTotal={total} />;
}
