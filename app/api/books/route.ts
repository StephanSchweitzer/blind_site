// app/api/books/route.ts
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import { BookWithGenres } from '@/types/book';

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

// Perform accent-insensitive search using raw SQL
async function performAccentInsensitiveSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number
): Promise<{ books: BookWithGenres[]; total: number }> {
    const searchTerm = `%${search.toLowerCase()}%`;

    // Build the base query
    const whereConditions: string[] = [];
    const params: QueryParam[] = [searchTerm];
    let paramCount = 1;

    if (filter === 'all') {
        whereConditions.push(`(
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

        return { books: booksWithGenres, total };
    } catch (error) {
        // The accent-insensitive path relies on the immutable_unaccent SQL function.
        // If it isn't present in this database it throws here — fall back to a
        // standard Prisma contains search instead of silently returning nothing.
        console.error('Accent-insensitive search failed, falling back to standard search:', error);
        return fallbackSearch(search, filter, genres, skip, limit);
    }
}

// Standard (accent-sensitive) search used when the raw SQL path is unavailable
async function fallbackSearch(
    search: string,
    filter: string,
    genres: number[],
    skip: number,
    limit: number
): Promise<{ books: BookWithGenres[]; total: number }> {
    const mode = Prisma.QueryMode.insensitive;

    let orConditions: Prisma.BookWhereInput[];
    if (filter === 'genre') {
        orConditions = [{ genres: { some: { genre: { name: { contains: search, mode } } } } }];
    } else if (filter === 'all') {
        orConditions = [
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
}

interface BooksApiError {
    error: string;
    message: string;
    books: BookWithGenres[];
    total: number;
    page: number;
    totalPages: number;
}

export async function GET(request: NextRequest): Promise<Response> {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const filter = searchParams.get('filter') || 'all';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '9');
        const genres = searchParams.getAll('genres').map(Number).filter(id => !isNaN(id));
        const recent = searchParams.get('recent') === 'true';
        const ids = searchParams.get('ids')?.split(',').map(Number).filter(id => !isNaN(id));
        const skip = (page - 1) * limit;

        // Handle specific IDs request
        if (ids && ids.length > 0) {
            const books = await prisma.book.findMany({
                where: { id: { in: ids } },
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
            const result = await performAccentInsensitiveSearch(search, filter, genres, skip, limit);
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

        const response: BooksApiResponse = {
            books,
            total,
            page,
            totalPages: Math.ceil(total / limit)
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
            totalPages: 0
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
    readingDurationMinutes?: string;
    pageCount?: string;
    genres: number[];
}

interface CreateBookResponse {
    success: boolean;
    message: string;
    book?: BookWithGenres;
}

export async function POST(req: NextRequest): Promise<Response> {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            const unauthorizedResponse: CreateBookResponse = {
                success: false,
                message: 'Unauthorized'
            };
            return new Response(JSON.stringify(unauthorizedResponse), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const userId = parseInt(session.user.id, 10);
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
}