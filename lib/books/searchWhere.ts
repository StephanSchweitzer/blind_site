import { Prisma } from '@prisma/client';
import { audioMissingWhere, audioPresentWhere } from '@/lib/books/audioFilter';
import { bookFieldsForToken, fieldVariants, searchTokens } from '@/lib/search';

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
    const contains = (value: string) => ({ contains: value, mode });
    const clauses: Prisma.BookWhereInput[] = [];

    /** One field, every spelling of the token — mirrors the raw SQL's anyVariant. */
    const anyVariant = (token: string, build: (value: string) => Prisma.BookWhereInput) => ({
        OR: fieldVariants(token, build),
    });

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
                clauses.push(anyVariant(token, (v) => ({ title: contains(v) })));
                break;
            case 'author':
                clauses.push(anyVariant(token, (v) => ({ author: contains(v) })));
                break;
            case 'description':
                clauses.push(anyVariant(token, (v) => ({ description: contains(v) })));
                break;
            case 'subtitle':
                clauses.push(anyVariant(token, (v) => ({ subtitle: contains(v) })));
                break;
            case 'publisher':
                clauses.push(anyVariant(token, (v) => ({ publisher: contains(v) })));
                break;
            case 'isbn':
                clauses.push(anyVariant(token, (v) => ({ isbn: contains(v) })));
                break;
            case 'genre':
                clauses.push(anyVariant(token, (v) => ({ genres: { some: { genre: { name: contains(v) } } } })));
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
