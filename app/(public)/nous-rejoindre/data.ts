import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const getMembershipOptions = unstable_cache(
    async () =>
        prisma.membershipOption.findMany({
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
        }),
    ['nous-rejoindre-v1'],
    { tags: [CACHE_TAGS.nousRejoindre], revalidate: 86400 },
);
