import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

export const getSiteContact = unstable_cache(
    async () => prisma.siteContact.findUnique({ where: { id: 1 } }),
    ['site-contact-v1'],
    { tags: [CACHE_TAGS.siteContact], revalidate: 86400 },
);
