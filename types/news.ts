// types/news.ts
import { News } from '@prisma/client';

export type NewsType = News['type'];

export interface NewsPost extends Omit<News, 'author'> {
    author: {
        name: string;
    };
}

export interface NewsResponse {
    items: NewsPost[];
    totalPages: number;
    currentPage: number;
    totalItems: number;
}

export const newsTypeLabels: Record<NewsType, string> = {
    GENERAL: 'Informations générales',
    EVENEMENT: 'Événement',
    ANNONCE: 'Annonce',
    ACTUALITE: 'Actualité',
    PROGRAMMATION: 'Programmation'
} as const;

/**
 * One palette for both sides of the site: the badge on Dernières infos and the
 * badge in the back office are the same type, so they get the same colour.
 * Solid backgrounds — they read identically in light and dark mode.
 */
export const newsTypeColors: Record<NewsType, string> = {
    GENERAL: 'bg-blue-500',
    EVENEMENT: 'bg-indigo-500',
    ANNONCE: 'bg-yellow-500',
    ACTUALITE: 'bg-green-500',
    PROGRAMMATION: 'bg-purple-500'
} as const;

/** Text colour that stays legible on the background above — yellow needs dark ink. */
export const newsTypeTextColors: Record<NewsType, string> = {
    GENERAL: 'text-white',
    EVENEMENT: 'text-white',
    ANNONCE: 'text-gray-900',
    ACTUALITE: 'text-white',
    PROGRAMMATION: 'text-white'
} as const;

export const getNewsTypeColor = (type: NewsType): string => newsTypeColors[type] ?? 'bg-gray-500';

export const getNewsTypeTextColor = (type: NewsType): string => newsTypeTextColors[type] ?? 'text-white';