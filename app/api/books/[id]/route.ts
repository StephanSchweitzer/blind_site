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