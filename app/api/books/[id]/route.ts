// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
    }>;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
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
            return NextResponse.json(
                { error: 'Book not found' },
                {
                    status: 404,
                    headers: corsHeaders
                }
            );
        }

        return NextResponse.json(book, { headers: corsHeaders });
    } catch (error) {
        console.error('Failed to fetch book:', error);
        return NextResponse.json(
            { error: 'Failed to fetch book' },
            {
                status: 400,
                headers: corsHeaders
            }
        );
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params;
    const {
        title,
        subtitle,
        author,
        publisher,
        publishedDate,
        genres,
        isbn,
        description,
        available,
        readingDurationMinutes,
        pageCount
    } = await req.json();

    if (isbn?.trim()) {
        const existingBook = await prisma.book.findFirst({
            where: {
                isbn,
                NOT: {id: parseInt(id, 10)}
            }
        });

        if (existingBook) {
            return NextResponse.json(
                {
                    error: 'Another book with this ISBN already exists',
                    message: 'Another book with this ISBN already exists'
                },
                {status: 409, headers: corsHeaders}
            );
        }
    }

    try {
        const updatedBook = await prisma.book.update({
            where: { id: parseInt(id, 10) },
            data: {
                title,
                subtitle,
                author,
                publisher,
                publishedDate: publishedDate ? new Date(publishedDate) : undefined,
                isbn,
                description,
                readingDurationMinutes,
                pageCount,
                available,
                updatedAt: new Date(),
                // Handle genres relationship
                genres: {
                    // Delete existing genre relationships
                    deleteMany: {},
                    // Create new genre relationships - FIXED: Convert string IDs to numbers
                    create: genres?.map((genreId: string) => ({
                        genre: {
                            connect: {
                                id: parseInt(genreId, 10)  // Convert string to number
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

        return NextResponse.json(
            {
                message: 'Book updated successfully',
                book: updatedBook
            },
            { headers: corsHeaders }
        );
    } catch (error) {
        console.error('Failed to update book:', error);
        return NextResponse.json(
            { error: 'Failed to update book' },
            {
                status: 400,
                headers: corsHeaders
            }
        );
    }
}

export async function DELETE(request: NextRequest, { params }: Params) {
    try {
        const { id } = await params;

        await prisma.book.delete({
            where: { id: parseInt(id, 10) }
        });

        return NextResponse.json(
            { success: true },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Error deleting book:', error);
        return NextResponse.json(
            { error: 'Failed to delete book' },
            { status: 500, headers: corsHeaders }
        );
    }
}