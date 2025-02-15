import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const filter = searchParams.get('filter') || 'all';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '9');
        const genres = searchParams.getAll('genres').map(Number);
        const recent = searchParams.get('recent') === 'true';
        const ids = searchParams.get('ids')?.split(',').map(Number).filter(id => !isNaN(id));
        const skip = (page - 1) * limit;

        let whereClause: Prisma.BookWhereInput = {};

        // If IDs are provided, fetch only those specific books
        if (ids && ids.length > 0) {
            whereClause.id = {
                in: ids
            };
            // When fetching by IDs, we don't want to apply pagination
            const books = await prisma.book.findMany({
                where: whereClause,
                include: {
                    genres: {
                        include: {
                            genre: true
                        }
                    }
                },
            });
            return new Response(
                JSON.stringify({ books }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        // Handle genres filter (from dropdown - exact match using IDs)
        if (genres.length > 0) {
            whereClause.genres = {
                some: {
                    genreId: {
                        in: genres
                    }
                }
            };
        }

        // Handle recent books filter
        if (recent) {
            const lastCoupDeCoeur = await prisma.coupsDeCoeur.findFirst({
                orderBy: {
                    createdAt: 'desc'
                }
            });

            if (lastCoupDeCoeur) {
                whereClause = {
                    ...whereClause,
                    createdAt: {
                        gte: lastCoupDeCoeur.createdAt
                    }
                };
            }
        }

        if (search) {
            const searchFilter = filter === 'all' ? {
                OR: [
                    {
                        title: {
                            mode: 'insensitive' as Prisma.QueryMode,
                            contains: search
                        }
                    },
                    {
                        subtitle: {
                            mode: 'insensitive' as Prisma.QueryMode,
                            contains: search
                        }
                    },
                    {
                        author: {
                            mode: 'insensitive' as Prisma.QueryMode,
                            contains: search
                        }
                    },
                    {
                        publisher: {
                            mode: 'insensitive' as Prisma.QueryMode,
                            contains: search
                        }
                    },
                    {
                        description: {
                            mode: 'insensitive' as Prisma.QueryMode,
                            contains: search
                        }
                    },
                    {
                        genres: {
                            some: {
                                genre: {
                                    name: {
                                        mode: 'insensitive' as Prisma.QueryMode,
                                        contains: search  // Uses contains for search queries
                                    }
                                }
                            }
                        }
                    }
                ]
            } : filter === 'genre' ? {
                genres: {
                    some: {
                        genre: {
                            name: {
                                mode: 'insensitive' as Prisma.QueryMode,
                                contains: search  // Uses contains for genre-specific searches
                            }
                        }
                    }
                }
            } : {
                [filter]: {
                    mode: 'insensitive' as Prisma.QueryMode,
                    contains: search
                }
            };

            // If we have both genres filter and search, combine them with AND
            if (genres.length > 0) {
                whereClause = {
                    AND: [
                        whereClause,
                        searchFilter
                    ]
                };
            } else {
                whereClause = {
                    ...whereClause,
                    ...searchFilter
                };
            }
        }

        const [books, total] = await Promise.all([
            prisma.book.findMany({
                where: whereClause,
                include: {
                    genres: {
                        include: {
                            genre: true
                        }
                    }
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            prisma.book.count({ where: whereClause })
        ]);

        return new Response(
            JSON.stringify({
                books,
                total,
                page,
                totalPages: Math.ceil(total / limit)
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Error in books API:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                message: errorMessage,
                books: [],
                total: 0,
                page: 1,
                totalPages: 0
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: 'Unauthorized'
                }),
                {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        const userId = parseInt(session.user.id, 10);
        const formData = await req.json();

        // Only check for existing ISBN if one is provided and it's not empty
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
                return new Response(
                    JSON.stringify({
                        success: false,
                        message: 'A book with this ISBN already exists'
                    }),
                    {
                        status: 409,
                        headers: { 'Content-Type': 'application/json' },
                    }
                );
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
                        genre: {
                            connect: {
                                id: genreId
                            }
                        }
                    }))
                }
            },
            include: {
                genres: {
                    include: {
                        genre: true
                    }
                }
            }
        });

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Book added successfully',
                book: newBook
            }),
            {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        console.error('API Error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                message: error instanceof Error ? error.message : 'Failed to add book'
            }),
            {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}