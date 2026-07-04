import CoupsDeCoeurClient from './CoupsDeCoeurClient';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import { getCoupsDeCoeurPage } from './data';

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
