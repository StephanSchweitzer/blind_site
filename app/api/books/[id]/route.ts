// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
    }>;
}

export async function GET(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const book = await prisma.book.findUnique({
            where: { id: parseInt(id, 10) },
            include: {
                genres: {
                    include: {
                        genre: true
                    }
                },
                addedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });
        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }
        return NextResponse.json(book);
    } catch (error) {
        console.error('Failed to fetch book:', error);
        return NextResponse.json({ error: 'Failed to fetch book' }, { status: 400 });
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    const id = await Promise.resolve(params.id);
    const {
        title,
        author,
        publishedDate,
        genres,
        isbn,
        description,
        available,
        readingDurationMinutes,
    } = await req.json();

    try {
        const updatedBook = await prisma.book.update({
            where: { id: parseInt(id, 10) },
            data: {
                title,
                author,
                publishedDate: publishedDate ? new Date(publishedDate) : undefined,
                isbn,
                description,
                readingDurationMinutes,
                available,
                updatedAt: new Date(),
                // Handle genres relationship
                genres: {
                    // Delete existing genre relationships
                    deleteMany: {},
                    // Create new genre relationships
                    create: genres?.map((genreId: number) => ({
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
                },
                addedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        return NextResponse.json({
            message: 'Book updated successfully',
            book: updatedBook
        });
    } catch (error) {
        console.error('Failed to update book:', error);
        return NextResponse.json({ error: 'Failed to update book' }, { status: 400 });
    }
}