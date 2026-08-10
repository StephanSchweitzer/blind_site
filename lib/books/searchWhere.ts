import { Prisma } from '@prisma/client';
import { audioMissingWhere, audioPresentWhere } from '@/lib/books/audioFilter';

export type AudioFilter = 'missing' | 'present' | undefined;

export interface BookScopeOptions {
    searchTerm?: string;
    filter?: string;
    genreIds?: number[];
    /** True for admin views, which may see hidden books; false forces them out. */
    includeHidden: boolean;
    hidden?: boolean;
    audio?: AudioFilter;
}

/**
 * Every book-list filter except availability — search, genre, hidden and
 * audio — so callers can scope an availability breakdown (disponible/en
 * attente counts) without duplicating the OR/AND wiring, and without the
 * count itself being gated by the very filter it's counting.
 */
export function buildBookScopeWhere({
    searchTerm,
    filter = 'all',
    genreIds = [],
    includeHidden,
    hidden,
    audio,
}: BookScopeOptions): Prisma.BookWhereInput {
    const mode = Prisma.QueryMode.insensitive;
    const clauses: Prisma.BookWhereInput[] = [];

    if (searchTerm) {
        switch (filter) {
            case 'title':
                clauses.push({ title: { contains: searchTerm, mode } });
                break;
            case 'author':
                clauses.push({ author: { contains: searchTerm, mode } });
                break;
            case 'description':
                clauses.push({ description: { contains: searchTerm, mode } });
                break;
            case 'genre':
                clauses.push({ genres: { some: { genre: { name: { contains: searchTerm, mode } } } } });
                break;
            default:
                clauses.push({
                    OR: [
                        { title: { contains: searchTerm, mode } },
                        { author: { contains: searchTerm, mode } },
                        { description: { contains: searchTerm, mode } },
                        { genres: { some: { genre: { name: { contains: searchTerm, mode } } } } },
                    ],
                });
        }
    }

    if (genreIds.length > 0) {
        clauses.push({ genres: { some: { genreId: { in: genreIds } } } });
    }

    if (!includeHidden) {
        clauses.push({ hiddenFromCatalogue: false });
    } else if (hidden !== undefined) {
        clauses.push({ hiddenFromCatalogue: hidden });
    }

    if (audio === 'missing' || audio === 'present') {
        clauses.push(audio === 'missing' ? audioMissingWhere() : audioPresentWhere());
    }

    if (clauses.length === 0) return {};
    if (clauses.length === 1) return clauses[0];
    return { AND: clauses };
}
