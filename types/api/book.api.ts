import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
    basicBookSelect,
    detailedBookSelect,
    bookIncludeConfigs,
    BookWithGenres,
    Book,
} from '../models/book.model';

// ============================================================================
// Summary Types (for forms and UI components)
// ============================================================================

export type BookSummary = Pick<Book, 'id' | 'title' | 'author'>;
export type BookBasicInfo = Pick<Book, 'id' | 'title' | 'author' | 'isbn'>;

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const BookQueryModeSchema = z.enum(['basic', 'detailed', 'full']);
export type BookQueryMode = z.infer<typeof BookQueryModeSchema>;

export const BookIncludeRelationSchema = z.enum([
    'genres',
    'addedBy',
    'orders',
    'assignments',
    'all',
]);
export type BookIncludeRelation = z.infer<typeof BookIncludeRelationSchema>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicBookResponse = Prisma.BookGetPayload<{
    select: typeof basicBookSelect;
}>;

export type DetailedBookResponse = Prisma.BookGetPayload<{
    select: typeof detailedBookSelect;
}>;

export type BookIncludeConfig = {
    genres?: boolean | Prisma.BookGenreFindManyArgs;
    addedBy?: boolean | Prisma.UserDefaultArgs;
    orders?: boolean | Prisma.OrdersFindManyArgs;
    assignments?: boolean | Prisma.AssignmentFindManyArgs;
    CoupsDeCoeurBooks?: boolean | Prisma.CoupsDeCoeurBooksFindManyArgs;
};

export type FullBookResponse = Prisma.BookGetPayload<{
    include: BookIncludeConfig;
}>;

// Alternative: Flexible type for API responses with genres
export interface BookWithGenresResponse {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    description: string | null;
    publishedDate: Date | null;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    isbn: string | null;
    publisher: string | null;
    available: boolean;
    createdAt: Date;
    updatedAt: Date;
    addedById: number;
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

// Search result type
export interface BookSearchResult {
    books: BookWithGenres[];
    total: number;
    page: number;
    totalPages: number;
}

// ============================================================================
// Create Input Types
// ============================================================================

export const BookCreateInputSchema = z.object({
    title: z.string().min(1),
    author: z.string().min(1),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    publishedDate: z.string().datetime().nullable().optional(),
    isbn: z.string().nullable().optional(),
    publisher: z.string().nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
    readingDurationMinutes: z.number().int().positive().nullable().optional(),
    available: z.boolean().default(true),
    addedById: z.number().int().positive(),
    genreIds: z.array(z.number().int().positive()).optional(),
});

export type BookCreateInput = z.infer<typeof BookCreateInputSchema>;

export type BookCreateData = {
    title: string;
    author: string;
    subtitle?: string | null;
    description?: string | null;
    publishedDate?: Date | null;
    isbn?: string | null;
    publisher?: string | null;
    pageCount?: number | null;
    readingDurationMinutes?: number | null;
    available?: boolean;
    addedById: number;
};

// ============================================================================
// Update Input Types
// ============================================================================

export const BookUpdateInputSchema = z.object({
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    subtitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    publishedDate: z.string().datetime().nullable().optional(),
    isbn: z.string().nullable().optional(),
    publisher: z.string().nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
    readingDurationMinutes: z.number().int().positive().nullable().optional(),
    available: z.boolean().optional(),
    genreIds: z.array(z.number().int().positive()).optional(),
});

export type BookUpdateInput = z.infer<typeof BookUpdateInputSchema>;

export type BookUpdateData = {
    title?: string;
    author?: string;
    subtitle?: string | null;
    description?: string | null;
    publishedDate?: Date | null;
    isbn?: string | null;
    publisher?: string | null;
    pageCount?: number | null;
    readingDurationMinutes?: number | null;
    available?: boolean;
};

// ============================================================================
// Filter/Query Types
// ============================================================================

export const BookFilterSchema = z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    isbn: z.string().optional(),
    genreId: z.number().optional(),
    available: z.boolean().optional(),
    search: z.string().optional(),
});

export type BookFilter = z.infer<typeof BookFilterSchema>;

// Export the include configs for use in API handlers
export { bookIncludeConfigs };