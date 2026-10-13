import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { PublicBook, toPublicBook } from '@/lib/books/publicBook';
import type { Genre } from '@prisma/client';

/**
 * Exported for lib/revalidate-public.ts, which has to know whether a book sits
 * on this cached first page: a book further down never reaches the cache.
 */
export const CATALOGUE_PAGE_SIZE = 9;

interface CatalogueData {
    initialBooks: PublicBook[];
    genres: Genre[];
    totalBooks: number;
    totalPages: number;
}

/**
 * Cached first page of the catalogue (books + genres + count) for zero-loading
 * static render. Invalidated on demand via the `catalogue` tag on any book or
 * genre write; `revalidate` is only a long fallback. Search / filter /
 * pagination continue to hit /api/catalogue at runtime.
 *
 * May throw — unstable_cache never stores a throw. The page rethrows it in
 * production, so a failed regeneration keeps the last good page instead of
 * caching an empty one; it renders the empty state only at build time and in
 * dev (lib/isr-read-error.ts).
 */
export const getCatalogueData = unstable_cache(
    async (): Promise<CatalogueData> => {
        const [books, genres, totalBooks] = await Promise.all([
            prisma.book.findMany({
                where: { hiddenFromCatalogue: false },
                include: {
                    genres: {
                        include: { genre: true },
                    },
                },
                take: CATALOGUE_PAGE_SIZE,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.genre.findMany({
                orderBy: { name: 'asc' },
            }),
            prisma.book.count({ where: { hiddenFromCatalogue: false } }),
        ]);

        return {
            // This is the page's own first render, not a fetch to /api/catalogue —
            // easy to forget that the same trimming has to happen here too. See
            // lib/books/publicBook.ts for what's dropped and why.
            initialBooks: books.map(toPublicBook),
            genres,
            totalBooks,
            totalPages: Math.ceil(totalBooks / CATALOGUE_PAGE_SIZE),
        };
    },
    ['catalogue-initial-v3'],
    { tags: [CACHE_TAGS.catalogue], revalidate: 86400 },
);
