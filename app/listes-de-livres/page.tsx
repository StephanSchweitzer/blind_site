import CoupsDeCoeurClient from './CoupsDeCoeurClient';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import { getCoupsDeCoeurPage, COUPS_DE_COEUR_PAGE_SIZE } from './data';
import { parsePageParam } from '@/lib/pagination';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Listes de livres',
    description: 'Découvrez les listes de livres et recommandations de lecture sélectionnées par les ECA.',
    alternates: { canonical: '/listes-de-livres' },
};

export default async function CoupsDeCoeurPage({
                                                   searchParams,
                                               }: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page: pageParam } = await searchParams;
    const page = parsePageParam(pageParam);

    const { items, total } = await getCoupsDeCoeurPage(page, COUPS_DE_COEUR_PAGE_SIZE);

    const content: CoupDeCoeur[] = items;

    return (
        <CoupsDeCoeurClient
            content={content}
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(total / COUPS_DE_COEUR_PAGE_SIZE))}
        />
    );
}
