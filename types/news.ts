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

export const newsTypeLabels: Record<NewsType, string> = {
    GENERAL: 'Informations générales',
    EVENEMENT: 'Événement',
    ANNONCE: 'Annonce',
    ACTUALITE: 'Actualité'
} as const;

export const newsTypeColors: Record<NewsType, string> = {
    GENERAL: 'bg-blue-500',  // or whatever colors you want
    EVENEMENT: 'bg-indigo-500',
    ANNONCE: 'bg-yellow-500',
    ACTUALITE: 'bg-green-500',
    PROGRAMMATION: 'bg-purple-500'
} as const;