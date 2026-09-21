import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const getPracticalInfo = unstable_cache(
    async () =>
        prisma.practicalInfo.findMany({
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
        }),
    ['informations-pratiques-v1'],
    { tags: [CACHE_TAGS.informationsPratiques], revalidate: 86400 },
);
