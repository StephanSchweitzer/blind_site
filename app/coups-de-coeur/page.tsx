import CoupsDeCoeurClient from './CoupsDeCoeurClient';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import { getCoupsDeCoeurPage } from './data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Listes de livres',
    description: 'Découvrez les listes de livres et recommandations de lecture sélectionnées par les ECA.',
    alternates: { canonical: '/coups-de-coeur' },
};

const LIMIT = 1;

export default async function CoupsDeCoeurPage({
                                                   searchParams,
                                               }: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page: pageParam } = await searchParams;
    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

    const { items, total } = await getCoupsDeCoeurPage(page, LIMIT);

    const content: CoupDeCoeur[] = items;

    return (
        <CoupsDeCoeurClient
            content={content}
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(total / LIMIT))}
        />
    );
}
