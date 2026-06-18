import { prisma } from '@/lib/prisma';
import CoupsDeCoeurClient from './CoupsDeCoeurClient';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';

const LIMIT = 1;

export default async function CoupsDeCoeurPage({
                                                   searchParams,
                                               }: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { page: pageParam } = await searchParams;
    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

    const [items, total] = await Promise.all([
        prisma.coupsDeCoeur.findMany({
            where: { active: true },
            include: {
                books: {
                    include: {
                        book: {
                            include: {
                                genres: { include: { genre: true } },
                            },
                        },
                    },
                },
                addedBy: { select: { name: true } },
            },
            skip: (page - 1) * LIMIT,
            take: LIMIT,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.coupsDeCoeur.count({ where: { active: true } }),
    ]);

    const content: CoupDeCoeur[] = items;

    return (
        <CoupsDeCoeurClient
            content={content}
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(total / LIMIT))}
        />
    );
}