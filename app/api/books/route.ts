// app/api/books/route.ts
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { Prisma } from '@prisma/client';
import { BookWithGenres } from '@/types/book';
import { withAdmin, getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { audioMissingWhere, audioPresentWhere, AUDIO_MISSING_STATUSES } from '@/lib/books/audioFilter';
import { buildBookScopeWhere } from '@/lib/books/searchWhere';
import { normalizeSearchQuery, parseEntityId } from '@/lib/search-query';

type AudioFilter = 'missing' | 'present' | undefined;

// Type definitions for raw SQL queries
interface CountResult {
    count: bigint;
}

interface RawBookResult {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    publisher: string | null;
    publishedDate: Date;
    isbn: string | null;
    description: string | null;
    available: boolean;
    hiddenFromCatalogue: boolean;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    addedById: number;
    createdAt: Date;
    updatedAt: Date;
}

// Type for query parameters
type QueryParam = string | number | number[];

// Cache headers for better performance
const CACHE_HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

/**
 * Move the row whose id the user searched for to the front.
 *
 * Asking for a book by number is an unambiguous request in a way a title
 * search never is, so it shouldn't have to be hunted for in a list sorted by
 * something else entirely. A no-op when the query wasn't an id, or when the
 * id didn't survive the other filters.
 */
function promoteExactId<T extends { id: number }>(rows: T[], entityId: number | null): T[] {
    if (entityId === null) return rows;
    const index = rows.findIndex((r) => r.id === entityId);
    if (index <= 0) return rows;
    return [rows[index], ...rows.filter((_, i) => i !== index)];
}

// Perform accent-insensitive search using raw SQL
async function performAccentInsensitiveSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number,
    includeHidden: boolean,
    available?: boolean,
    hiddenFilter?: boolean,
    audio?: AudioFilter
): Promise<{ books: BookWithGenres[]; total: number }> {
    const searchTerm = `%${search.toLowerCase()}%`;

    // Build the base query
    const whereConditions: string[] = [];
    const params: QueryParam[] = [searchTerm];
    let paramCount = 1;

    // Staff look books up by the id shown in « Modifier le livre #42 ». It's
    // inlined rather than parameterised for the same reason the booleans below
    // are: parseEntityId returns a validated positive int4 or null — never raw
    // user input — and threading another positional param through this builder
    // would renumber every $N that follows.
    const entityId = parseEntityId(search);
    const idClause = entityId !== null ? `b.id = ${entityId} OR ` : '';

    if (filter === 'all') {
        whereConditions.push(`(
            ${idClause}
            LOWER(immutable_unaccent(b.title)) LIKE LOWER(immutable_unaccent($1)) OR
            LOWER(immutable_unaccent(COALESCE(b.subtitle, ''))) LIKE LOWER(immutable_unaccent($1)) OR
            LOWER(immutable_unaccent(b.author)) LIKE LOWER(immutable_unaccent($1)) OR
            LOWER(immutable_unaccent(COALESCE(b.publisher, ''))) LIKE LOWER(immutable_unaccent($1)) OR
            (b.isbn IS NOT NULL AND LOWER(b.isbn) LIKE LOWER($1)) OR
            (b.description IS NOT NULL AND LOWER(b.description) LIKE LOWER($1)) OR
            EXISTS (
                SELECT 1 FROM "BookGenre" bg
                JOIN "Genre" g ON bg."genreId" = g.id
                WHERE bg."bookId" = b.id AND LOWER(immutable_unaccent(g.name)) LIKE LOWER(immutable_unaccent($1))
            )
        )`);
    } else if (filter === 'genre') {
        whereConditions.push(`
            EXISTS (
                SELECT 1 FROM "BookGenre" bg
                JOIN "Genre" g ON bg."genreId" = g.id
                WHERE bg."bookId" = b.id AND LOWER(immutable_unaccent(g.name)) LIKE LOWER(immutable_unaccent($1))
            )
        `);
    } else {
        const columnMap: Record<string, string> = {
            'title': 'b.title',
            'author': 'b.author',
            'description': 'b.description',
            'subtitle': 'b.subtitle',
            'publisher': 'b.publisher',
            'isbn': 'b.isbn'
        };
        const column = columnMap[filter] || 'b.title';

        // Special handling for description due to size
        if (filter === 'description') {
            whereConditions.push(`LOWER(b.description) LIKE LOWER($1)`);
        } else if (filter === 'isbn') {
            // ISBN carries no accents; a plain LIKE is enough (and matches with/without hyphens).
            whereConditions.push(`(b.isbn IS NOT NULL AND LOWER(b.isbn) LIKE LOWER($1))`);
        } else {
            whereConditions.push(`LOWER(immutable_unaccent(COALESCE(${column}, ''))) LIKE LOWER(immutable_unaccent($1))`);
        }
    }

    // Exclude books hidden from the public catalogue, unless the caller is admin
    if (!includeHidden) {
        whereConditions.push(`b."hiddenFromCatalogue" = false`);
    } else if (hiddenFilter !== undefined) {
        whereConditions.push(`b."hiddenFromCatalogue" = ${hiddenFilter}`);
    }

    // available/hiddenFilter/audio are all derived above (never raw user
    // input), so inlining them is safe and sidesteps $queryRawUnsafe's
    // boolean-param typing quirks.
    if (available !== undefined) {
        whereConditions.push(`b.available = ${available}`);
    }

    if (audio === 'missing' || audio === 'present') {
        const missingStatusList = AUDIO_MISSING_STATUSES.map((s) => `'${s}'`).join(',');
        const missingCondition = `(
            b.audio_filepath IS NULL OR b.audio_filepath = '' OR
            b."audioLinkStatus" IN (${missingStatusList}) OR
            b."audioTrackCount" <= 0
        )`;
        whereConditions.push(audio === 'missing' ? missingCondition : `NOT ${missingCondition}`);
    }

    // Add genre filter if specified
    if (genres.length > 0) {
        paramCount++;
        params.push(genres);
        whereConditions.push(`
            EXISTS (
                SELECT 1 FROM "BookGenre" bg
                WHERE bg."bookId" = b.id AND bg."genreId" = ANY($${paramCount})
            )
        `);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get count
    const countQuery = `
        SELECT COUNT(DISTINCT b.id) as count
        FROM "Book" b
            ${whereClause}
    `;

    // Get data with pagination
    paramCount++;
    params.push(skip);
    paramCount++;
    params.push(limit);

    const dataQuery = `
        SELECT DISTINCT b.*
        FROM "Book" b
            ${whereClause}
        ORDER BY b."createdAt" DESC
        OFFSET $${paramCount - 1} LIMIT $${paramCount}
    `;

    try {
        const [countResult, books] = await Promise.all([
            prisma.$queryRawUnsafe<CountResult[]>(countQuery, ...params.slice(0, -2)),
            prisma.$queryRawUnsafe<RawBookResult[]>(dataQuery, ...params)
        ]);

        const total = Number(countResult[0]?.count || 0);

        if (books.length === 0) {
            return { books: [], total: 0 };
        }

        // Get genres for the books
        const bookIds = books.map(b => b.id);
        const booksWithGenres = await prisma.book.findMany({
            where: { id: { in: bookIds } },
            include: {
                genres: {
                    include: { genre: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // An exact id match leads the page. Both queries sort by createdAt, so
        // without this the one book someone looked up by number sits wherever
        // its creation date happens to put it in a 25-row list.
        return { books: booksWithGenres, total };
    } catch (error) {
        // The accent-insensitive path relies on the immutable_unaccent SQL function.
        // If it isn't present in this database it throws here — fall back to a
        // standard Prisma contains search instead of silently returning nothing.
        console.error('Accent-insensitive search failed, falling back to standard search:', error);
        return fallbackSearch(search, filter, genres, skip, limit, includeHidden, available, hiddenFilter, audio);
    }
}

// Standard (accent-sensitive) search used when the raw SQL path is unavailable
async function fallbackSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number,
    includeHidden: boolean,
    available?: boolean,
    hiddenFilter?: boolean,
    audio?: AudioFilter
): Promise<{ books: BookWithGenres[]; total: number }> {
    const mode = Prisma.QueryMode.insensitive;

    let orConditions: Prisma.BookWhereInput[];
    if (filter === 'genre') {
        orConditions = [{ genres: { some: { genre: { name: { contains: search, mode } } } } }];
    } else if (filter === 'all') {
        const entityId = parseEntityId(search);
        orConditions = [
            // Mirrors the id clause in the accent-insensitive path above, so a
            // database without immutable_unaccent doesn't quietly lose id lookup.
            ...(entityId !== null ? [{ id: entityId }] : []),
            { title: { contains: search, mode } },
            { subtitle: { contains: search, mode } },
            { author: { contains: search, mode } },
            { publisher: { contains: search, mode } },
            { isbn: { contains: search, mode } },
            { description: { contains: search, mode } },
            { genres: { some: { genre: { name: { contains: search, mode } } } } },
        ];
    } else {
        const allowed = ['title', 'author', 'description', 'subtitle', 'publisher', 'isbn'] as const;
        const column = (allowed as readonly string[]).includes(filter) ? filter : 'title';
        orConditions = [{ [column]: { contains: search, mode } } as Prisma.BookWhereInput];
    }

    const where: Prisma.BookWhereInput = { OR: orConditions };
    if (genres.length > 0) {
        where.AND = [{ genres: { some: { genreId: { in: genres } } } }];
    }
    if (!includeHidden) {
        where.hiddenFromCatalogue = false;
    } else if (hiddenFilter !== undefined) {
        where.hiddenFromCatalogue = hiddenFilter;
    }
    if (available !== undefined) {
        where.available = available;
    }
    if (audio === 'missing' || audio === 'present') {
        const audioCondition = audio === 'missing' ? audioMissingWhere() : audioPresentWhere();
        where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), audioCondition];
    }

    const [books, total] = await Promise.all([
        prisma.book.findMany({
            where,
            include: { genres: { include: { genre: true } } },
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.book.count({ where }),
    ]);

    return { books, total };
}

// Type for the API response
interface BooksApiResponse {
    books: BookWithGenres[];
    total: number;
    page: number;
    totalPages: number;
    availableCount: number;
    unavailableCount: number;
}

interface BooksApiError {
    error: string;
    message: string;
    books: BookWithGenres[];
    total: number;
    page: number;
    totalPages: number;
    availableCount: number;
    unavailableCount: number;
}

export async function GET(request: NextRequest): Promise<Response> {
    try {
        const searchParams = request.nextUrl.searchParams;
        // Normalized so a pasted « #42 » resolves to book 42 — the public
        // catalogue shares this route, and « # » is never meaningful in a title
        // search either way.
        const search = normalizeSearchQuery(searchParams.get('search') || '');
        const filter = searchParams.get('filter') || 'all';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '9');
        const genres = searchParams.getAll('genres').map(Number).filter(id => !isNaN(id));
        const recent = searchParams.get('recent') === 'true';
        const ids = searchParams.get('ids')?.split(',').map(Number).filter(id => !isNaN(id));
        const availableParam = searchParams.get('available');
        const available = availableParam === 'true' ? true : availableParam === 'false' ? false : undefined;
        const hiddenParam = searchParams.get('hidden');
        const hiddenFilter = hiddenParam === 'true' ? true : hiddenParam === 'false' ? false : undefined;
        const audioParam = searchParams.get('audio');
        const audio: AudioFilter = audioParam === 'missing' ? 'missing' : audioParam === 'present' ? 'present' : undefined;
        const skip = (page - 1) * limit;

        // Hidden books stay out of every public read path here; admins see
        // everything, since this route also backs the admin book list/search
        // and the Coup de Cœur book selector.
        const me = await getCurrentUser();
        const includeHidden = isAdmin(me?.accessLevel);

        // Handle specific IDs request
        if (ids && ids.length > 0) {
            const books = await prisma.book.findMany({
                where: {
                    id: { in: ids },
                    ...(includeHidden ? {} : { hiddenFromCatalogue: false }),
                },
                include: {
                    genres: {
                        include: { genre: true }
                    }
                },
            });
            return new Response(JSON.stringify({ books }), {
                status: 200,
                headers: CACHE_HEADERS,
            });
        }

        // Build base where clause
        const whereClause: Prisma.BookWhereInput = {};
        if (!includeHidden) {
            whereClause.hiddenFromCatalogue = false;
        } else if (hiddenFilter !== undefined) {
            whereClause.hiddenFromCatalogue = hiddenFilter;
        }
        if (available !== undefined) {
            whereClause.available = available;
        }
        if (audio === 'missing' || audio === 'present') {
            const audioCondition = audio === 'missing' ? audioMissingWhere() : audioPresentWhere();
            whereClause.AND = [...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []), audioCondition];
        }

        // Handle recent books filter
        if (recent) {
            const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            });
            if (lastCoupDeCoeur) {
                whereClause.createdAt = { gte: lastCoupDeCoeur.createdAt };
            }
        }

        // Perform search or regular query
        let books: BookWithGenres[];
        let total: number;

        if (search) {
            // Always use accent-insensitive search when there's a search term
            const result = await performAccentInsensitiveSearch(search, filter, genres, skip, limit, includeHidden, available, hiddenFilter, audio);
            books = result.books;
            total = result.total;
        } else if (genres.length > 0) {
            // Genre-only filtering without search
            whereClause.genres = {
                some: { genreId: { in: genres } }
            };
            [books, total] = await Promise.all([
                prisma.book.findMany({
                    where: whereClause,
                    include: {
                        genres: {
                            include: { genre: true }
                        }
                    },
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.book.count({ where: whereClause })
            ]);
        } else {
            // No search, no genres - just pagination
            [books, total] = await Promise.all([
                prisma.book.findMany({
                    where: whereClause,
                    include: {
                        genres: {
                            include: { genre: true }
                        }
                    },
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' }
                }),
                prisma.book.count({ where: whereClause })
            ]);
        }

        // An exact id match leads the first page.
        //
        // Both search paths sort by createdAt, so the one book someone looked
        // up by number lands wherever its creation date puts it — and « 100 »
        // also matches every title and description containing those digits, so
        // it routinely sorts past the end of the page entirely. Promoting it
        // within the page isn't enough; when it's missing it's fetched on its
        // own, under the same visibility and genre filters the list obeys.
        const entityId = search ? parseEntityId(search) : null;
        if (entityId !== null && page === 1) {
            if (books.some((b) => b.id === entityId)) {
                books = promoteExactId(books, entityId);
            } else {
                const exact = await prisma.book.findFirst({
                    where: {
                        AND: [
                            { id: entityId },
                            whereClause,
                            ...(genres.length > 0
                                ? [{ genres: { some: { genreId: { in: genres } } } }]
                                : []),
                        ],
                    },
                    include: { genres: { include: { genre: true } } },
                });
                if (exact) books = [exact, ...books.slice(0, -1)];
            }
        }

        // Scoped to every filter except availability, so these counts always
        // reflect the current search/genre/hidden/audio filters without being
        // gated by the availability filter they're meant to summarize.
        const scopedWhere = buildBookScopeWhere({
            searchTerm: search,
            filter,
            genreIds: genres,
            includeHidden,
            hidden: hiddenFilter,
            audio,
        });
        const [availableCount, unavailableCount] = await Promise.all([
            prisma.book.count({ where: { AND: [scopedWhere, { available: true }] } }),
            prisma.book.count({ where: { AND: [scopedWhere, { available: false }] } }),
        ]);

        const response: BooksApiResponse = {
            books,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            availableCount,
            unavailableCount,
        };

        return new Response(JSON.stringify(response), {
            status: 200,
            headers: CACHE_HEADERS,
        });

    } catch (error) {
        console.error('Error in books API:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        const errorResponse: BooksApiError = {
            error: 'Internal server error',
            message: errorMessage,
            books: [],
            total: 0,
            page: 1,
            totalPages: 0,
            availableCount: 0,
            unavailableCount: 0,
        };

        return new Response(JSON.stringify(errorResponse), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Type for POST request body
interface CreateBookRequest {
    title: string;
    subtitle?: string;
    author: string;
    publisher?: string;
    publishedDate: string;
    isbn?: string;
    description?: string;
    available: boolean;
    hiddenFromCatalogue?: boolean;
    readingDurationMinutes?: string;
    pageCount?: string;
    genres: number[];
}

interface CreateBookResponse {
    success: boolean;
    message: string;
    book?: BookWithGenres;
}

export const POST = withAdmin(async (req, { me }): Promise<Response> => {
    revalidateAdmin();
    try {
        const userId = me.id;
        const formData: CreateBookRequest = await req.json();

        if (formData.isbn?.trim()) {
            const existingBook = await prisma.book.findFirst({
                where: {
                    isbn: {
                        equals: formData.isbn,
                        mode: 'insensitive'
                    }
                }
            });

            if (existingBook) {
                const conflictResponse: CreateBookResponse = {
                    success: false,
                    message: 'A book with this ISBN already exists'
                };
                return new Response(JSON.stringify(conflictResponse), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        const newBook = await prisma.book.create({
            data: {
                title: formData.title,
                subtitle: formData.subtitle,
                author: formData.author,
                publisher: formData.publisher,
                publishedDate: new Date(formData.publishedDate),
                isbn: formData.isbn?.trim() || null,
                description: formData.description,
                available: formData.available,
                hiddenFromCatalogue: formData.hiddenFromCatalogue ?? false,
                readingDurationMinutes: formData.readingDurationMinutes ? parseInt(formData.readingDurationMinutes) : null,
                pageCount: formData.pageCount ? parseInt(formData.pageCount) : null,
                addedById: userId,
                genres: {
                    create: formData.genres.map((genreId: number) => ({
                        genre: { connect: { id: genreId } }
                    }))
                }
            },
            include: {
                genres: {
                    include: { genre: true }
                }
            }
        });

        const successResponse: CreateBookResponse = {
            success: true,
            message: 'Book added successfully',
            book: newBook
        };

        revalidateCatalogue();

        return new Response(JSON.stringify(successResponse), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('API Error:', error);
        const errorResponse: CreateBookResponse = {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to add book'
        };
        return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});