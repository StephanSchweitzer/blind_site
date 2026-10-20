import { PublicBook } from '@/lib/books/publicBook';

export interface CoupDeCoeur {
    id: number;
    title: string;
    description: string | null;
    audioPath: string | null;
    books: {
        book: PublicBook;
        /** Note propre à ce livre dans cette liste, affichée après sa présentation. */
        note?: string | null;
        /** Rang choisi dans l'éditeur ; null : ordre alphabétique (lib/books/listGenres.ts). */
        position?: number | null;
    }[];
}

export interface CoupsDeCoeurResponse {
    items: CoupDeCoeur[];
    total: number;
    page: number;
    totalPages: number;
}