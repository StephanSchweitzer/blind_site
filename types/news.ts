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
/**
 * Badge backgrounds. These are paired with the text colours below and every
 * combination has to clear 4.5:1 — the badge label is 14px, so the large-text
 * exemption does not apply.
 *
 * The -500 shades used previously measured, against white: blue 3.68:1,
 * indigo 4.47:1, green 2.28:1, purple 3.96:1 — all under the bar, green badly
 * so. The -600/-700 shades below are 5.0-6.3:1. Yellow keeps its light shade
 * because it carries dark ink instead (9.25:1).
 */
export const newsTypeColors: Record<NewsType, string> = {
    GENERAL: 'bg-blue-600',
    EVENEMENT: 'bg-indigo-600',
    ANNONCE: 'bg-yellow-500',
    ACTUALITE: 'bg-green-700',
    PROGRAMMATION: 'bg-purple-600'
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