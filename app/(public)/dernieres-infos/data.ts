import { unstable_cache } from 'next/cache';
import { listPublicNews, PUBLIC_NEWS_PAGE_SIZE } from '@/lib/news/newsList';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { NewsResponse } from '@/types/news';

export const NEWS_PAGE_SIZE = PUBLIC_NEWS_PAGE_SIZE;

/**
 * Cached default view of the news feed (page 1, all types, no search) used to
 * server-render the page with zero loading time. Invalidated on demand via the
 * `news` tag whenever an admin creates/edits/deletes an article; the
 * `revalidate` value is only a long safety-net fallback, not the primary
 * freshness mechanism. Interactive search / type-filter / pagination continue
 * to hit /api/news at runtime.
 */
export const getInitialNews = unstable_cache(
    (): Promise<NewsResponse> =>
        listPublicNews({ search: '', type: null, page: 1, limit: NEWS_PAGE_SIZE, suggest: false }),
    ['dernieres-infos-initial-v1'],
    { tags: [CACHE_TAGS.news], revalidate: 3600 },
);
