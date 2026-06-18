import { BookWithGenres } from '@/types/book';

export interface CoupDeCoeur {
    id: number;
    title: string;
    description: string | null;
    audioPath: string | null;
    books: {
        book: BookWithGenres;
    }[];
}

export interface CoupsDeCoeurResponse {
    items: CoupDeCoeur[];
    total: number;
    page: number;
    totalPages: number;
}