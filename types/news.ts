// types/news.ts
import { News, Prisma } from '@prisma/client';

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

// Helper for displaying French labels
export const newsTypeLabels: Record<NewsType, string> = {
    GENERAL: 'Informations générales',
    EVENEMENT: 'Événement',
    ANNONCE: 'Annonce',
    ACTUALITE: 'Actualité',
    PROGRAMMATION: 'Programmation'
} as const;

// Helper for colors
export const newsTypeColors: Record<NewsType, string> = {
    GENERAL: 'bg-gray-500',
    EVENEMENT: 'bg-blue-500',
    ANNONCE: 'bg-yellow-500',
    ACTUALITE: 'bg-green-500',
    PROGRAMMATION: 'bg-purple-500'
} as const;