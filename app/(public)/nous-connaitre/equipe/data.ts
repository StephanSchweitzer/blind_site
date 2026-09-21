import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const getTeam = unstable_cache(
    async () =>
        prisma.teamMember.findMany({
            where: { active: true },
            orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        }),
    ['team-v1'],
    { tags: [CACHE_TAGS.team], revalidate: 86400 },
);
