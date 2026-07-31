// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

const invalidId = () => NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

/** Numeric book id from the route params, or null when it isn't one. */
async function bookIdFrom(params?: Promise<Record<string, string>>): Promise<number | null> {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    return Number.isInteger(bookId) ? bookId : null;
}

// Admin-only, including the read: this route exposes staff details (addedBy
// name/email) and is only ever called from the back office. The public
// catalogue reads through the collection route (`/api/books`), which stays
// open — so guarding here costs the public pages nothing.
export const GET = withAdmin(async (_req, { params }) => {
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        const book = await prisma.book.findUnique({
            where: { id: bookId },
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
});

export const PUT = withAdmin(async (req, { params }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

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
                NOT: { id: bookId }
            }
        });

        if (existingBook) {
            return NextResponse.json(
                {
                    error: 'Another book with this ISBN already exists',
                    message: 'Another book with this ISBN already exists'
                },
                { status: 409 }
            );
        }
    }

    try {
        const updatedBook = await prisma.book.update({
            where: { id: bookId },
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

        revalidateCatalogue();

        return NextResponse.json({
            message: 'Book updated successfully',
            book: updatedBook
        });
    } catch (error) {
        console.error('Failed to update book:', error);
        return NextResponse.json({ error: 'Failed to update book' }, { status: 400 });
    }
});

export const DELETE = withAdmin(async (_request, { params }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        await prisma.book.delete({
            where: { id: bookId }
        });

        revalidateCatalogue();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error deleting book:', error);
        return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
    }
});
