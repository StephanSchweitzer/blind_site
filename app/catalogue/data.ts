import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';
import type { BookWithGenres } from '@/types/book';
import type { Genre } from '@prisma/client';

const CATALOGUE_PAGE_SIZE = 9;

interface CatalogueData {
    initialBooks: BookWithGenres[];
    genres: Genre[];
    totalBooks: number;
    totalPages: number;
}

/**
 * Cached first page of the catalogue (books + genres + count) for zero-loading
 * static render. Invalidated on demand via the `catalogue` tag on any book or
 * genre write; `revalidate` is only a long fallback. Search / filter /
 * pagination continue to hit /api/books at runtime.
 *
 * May throw — the page catches and renders an empty state so a transient DB
 * error is not what gets cached for the fallback window.
 */
export const getCatalogueData = unstable_cache(
    async (): Promise<CatalogueData> => {
        const [initialBooks, genres, totalBooks] = await Promise.all([
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
            initialBooks,
            genres,
            totalBooks,
            totalPages: Math.ceil(totalBooks / CATALOGUE_PAGE_SIZE),
        };
    },
    ['catalogue-initial-v1'],
    { tags: [CACHE_TAGS.catalogue], revalidate: 3600 },
);
