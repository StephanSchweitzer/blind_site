// types/book.ts
import { Book, Genre, BookGenre } from '@prisma/client';
import type { PublicBook } from '@/lib/books/publicBook';
import type { SearchSuggestion } from '@/lib/search-suggestion-types';

// Ensure this matches your Prisma schema exactly
export interface BookWithGenres extends Book {
    genres: (BookGenre & {
        genre: Genre;
    })[];
}

// Alternative: If you need a more flexible type for API responses
export interface BookWithGenresResponse extends Omit<Book, 'genres'> {
    genres: {
        bookId: number;
        genreId: number;
        genre: {
            id: number;
            name: string;
            description: string | null;
        };
    }[];
}

export interface SearchResult {
    books: PublicBook[];
    total: number;
    page: number;
    totalPages: number;
    /** « Vouliez-vous dire … ? » — present only when a search found nothing. */
    searchSuggestions?: SearchSuggestion[];
}