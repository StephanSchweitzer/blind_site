import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { NewsPost, NewsResponse } from '@/types/news';

export const NEWS_PAGE_SIZE = 5;

/**
 * Cached default view of the news feed (page 1, all types, no search) used to
 * server-render the page with zero loading time. Invalidated on demand via the
 * `news` tag whenever an admin creates/edits/deletes an article; the
 * `revalidate` value is only a long safety-net fallback, not the primary
 * freshness mechanism. Interactive search / type-filter / pagination continue
 * to hit /api/news at runtime.
 */
export const getInitialNews = unstable_cache(
    async (): Promise<NewsResponse> => {
        const [rows, total] = await Promise.all([
            prisma.news.findMany({
                take: NEWS_PAGE_SIZE,
                orderBy: { publishedAt: 'desc' },
                include: { author: { select: { name: true } } },
            }),
            prisma.news.count(),
        ]);

        const items: NewsPost[] = rows.map((n) => ({
            ...n,
            author: { name: n.author.name ?? '' },
        }));

        return {
            items,
            totalPages: Math.ceil(total / NEWS_PAGE_SIZE),
            currentPage: 1,
            totalItems: total,
        };
    },
    ['dernieres-infos-initial-v1'],
    { tags: [CACHE_TAGS.news], revalidate: 3600 },
);
