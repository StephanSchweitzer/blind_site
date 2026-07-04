import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const getHistory = unstable_cache(
    async () =>
        prisma.historyEvent.findMany({
            orderBy: { year: 'asc' },
        }),
    ['historique-v1'],
    { tags: [CACHE_TAGS.historique], revalidate: 86400 },
);
