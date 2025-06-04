// types/book.ts
import { Book, Genre, BookGenre } from '@prisma/client';

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
    books: BookWithGenres[];
    total: number;
    page: number;
    totalPages: number;
}