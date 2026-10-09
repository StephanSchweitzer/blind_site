import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS } from '@/lib/cache-tags';

/**
 * The small lists the back-office forms show in their selects. Loaded once,
 * server-side, by app/admin/layout.tsx and handed down through
 * ReferenceDataProvider: fetched on mount instead, a select would render blank
 * — its value already set, its options not yet there — until the API answered.
 * Writes to any of these tables call revalidateReferenceData().
 */
export interface ReferenceData {
    statuses: { id: number; name: string; description: string | null; sortOrder: number | null }[];
    mediaFormats: { id: number; name: string; description: string | null }[];
    civilities: { id: number; name: string }[];
    genres: { id: number; name: string; description: string | null }[];
}

export const getReferenceData = unstable_cache(
    async (): Promise<ReferenceData> => {
        const [statuses, mediaFormats, civilities, genres] = await Promise.all([
            prisma.status.findMany({
                select: { id: true, name: true, description: true, sortOrder: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            }),
            prisma.mediaFormat.findMany({
                select: { id: true, name: true, description: true },
                orderBy: { name: 'asc' },
            }),
            prisma.civility.findMany({
                where: { isActive: true },
                select: { id: true, name: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            }),
            prisma.genre.findMany({
                select: { id: true, name: true, description: true },
                orderBy: { name: 'asc' },
            }),
        ]);
        return { statuses, mediaFormats, civilities, genres };
    },
    ['reference-data-v1'],
    { tags: [CACHE_TAGS.referenceData], revalidate: 86400 },
);
