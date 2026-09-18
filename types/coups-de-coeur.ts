import { PublicBook } from '@/lib/books/publicBook';

export interface CoupDeCoeur {
    id: number;
    title: string;
    description: string | null;
    audioPath: string | null;
    books: {
        book: PublicBook;
    }[];
}

export interface CoupsDeCoeurResponse {
    items: CoupDeCoeur[];
    total: number;
    page: number;
    totalPages: number;
}