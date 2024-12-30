import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';
        const filter = searchParams.get('filter') || 'all';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '9');
        const genres = searchParams.getAll('genres').map(Number);
        const skip = (page - 1) * limit;

        let whereClause: any = {};

        if (genres.length > 0) {
            whereClause.genres = {
                some: {
                    genreId: {
                        in: genres
                    }
                }
            };
        }

        if (search) {
            const searchFilter = filter === 'all' ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { author: { contains: search, mode: 'insensitive' } },
                    {
                        genres: {
                            some: {
                                genre: {
                                    name: { contains: search, mode: 'insensitive' }
                                }
                            }
                        }
                    }
                ]
            } : filter === 'genre' ? {
                genres: {
                    some: {
                        genre: {
                            name: { contains: search, mode: 'insensitive' }
                        }
                    }
                }
            } : {
                [filter]: { contains: search, mode: 'insensitive' }
            };

            whereClause = {
                ...whereClause,
                ...searchFilter
            };
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
                orderBy: { title: 'asc' }
            }),
            prisma.book.count({ where: whereClause })
        ]);

        return NextResponse.json({
            books,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error in books API:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return new Response(JSON.stringify({
                success: false,
                message: 'Unauthorized'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const userId = parseInt(session.user.id, 10);
        const formData = await req.json();

        const newBook = await prisma.book.create({
            data: {
                title: formData.title,
                author: formData.author,
                publishedDate: new Date(formData.publishedDate),
                isbn: formData.isbn,
                description: formData.description,
                available: formData.available,
                readingDurationMinutes: formData.readingDurationMinutes ? parseInt(formData.readingDurationMinutes) : null,
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

        return new Response(JSON.stringify({
            success: true,
            message: 'Book added successfully',
            book: newBook
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('API Error:', error);
        return new Response(JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to add book'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}