import { Prisma } from '@prisma/client';
import { audioMissingWhere, audioPresentWhere } from '@/lib/books/audioFilter';
import { bookFieldsForToken, searchTokens } from '@/lib/search';

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

    // Tokenized: every word must match something, but different words may match
    // different columns — « camus étranger » is an author and a title, and used
    // to find nothing because the whole phrase was tested against each column in
    // turn. A single-word query is unchanged.
    //
    // The `default` branch must list exactly the columns the route's raw SQL
    // searches, or this count and that list disagree; `bookFieldsForToken` is
    // the shared definition.
    for (const token of searchTokens(searchTerm ?? '')) {
        switch (filter) {
            case 'title':
                clauses.push({ title: { contains: token, mode } });
                break;
            case 'author':
                clauses.push({ author: { contains: token, mode } });
                break;
            case 'description':
                clauses.push({ description: { contains: token, mode } });
                break;
            case 'subtitle':
                clauses.push({ subtitle: { contains: token, mode } });
                break;
            case 'publisher':
                clauses.push({ publisher: { contains: token, mode } });
                break;
            case 'isbn':
                clauses.push({ isbn: { contains: token, mode } });
                break;
            case 'genre':
                clauses.push({ genres: { some: { genre: { name: { contains: token, mode } } } } });
                break;
            default:
                clauses.push({ OR: bookFieldsForToken(token) });
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
