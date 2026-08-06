// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { resolvePrefix } from '@/lib/audio/state';
import { listBookTracks } from '@/lib/audio/bucket';
import { softDeleteTrack } from '@/lib/audio/trash';

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

/**
 * Deleting a book also removes its audio from the bucket — through the same
 * corbeille path as a manual track delete, not a raw bucket wipe, so a book
 * deleted by mistake still leaves its recordings recoverable for the same 14
 * days as everything else in lib/audio/purge.ts.
 *
 * Order matters: tracks are moved to the corbeille BEFORE the book row is
 * deleted, because DeletedAudioTrack.bookId is a real foreign key — it can
 * only be set on insert while the book still exists (onDelete: SetNull only
 * fires afterwards, once, on rows that already reference it). Deleting the
 * book first and soft-deleting after would violate that constraint.
 *
 * Orders/Assignment reference Book with no onDelete override (Postgres
 * RESTRICT), so a book with any request or attribution history can't be
 * deleted at all — checked up front, before the bucket is touched. Otherwise
 * a book that turns out to be undeletable would still have had its audio
 * folder emptied for nothing.
 */
export const DELETE = withAdmin(async (_request, { params, me }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        const book = await prisma.book.findUnique({
            where: { id: bookId },
            select: { audio_filepath: true },
        });
        if (!book) {
            return NextResponse.json({ error: 'Livre introuvable' }, { status: 404 });
        }

        const [orderCount, assignmentCount] = await Promise.all([
            prisma.orders.count({ where: { catalogueId: bookId } }),
            prisma.assignment.count({ where: { catalogueId: bookId } }),
        ]);
        if (orderCount > 0 || assignmentCount > 0) {
            return NextResponse.json(
                { error: 'Ce livre a des demandes ou attributions associées et ne peut pas être supprimé.' },
                { status: 409 }
            );
        }

        const audioFailures: string[] = [];
        const prefix = resolvePrefix(book.audio_filepath);
        if (prefix) {
            const tracks = await listBookTracks(prefix);
            for (const track of tracks) {
                try {
                    await softDeleteTrack({
                        bookId,
                        key: track.key,
                        filename: track.name,
                        userId: me.id,
                    });
                } catch (e) {
                    console.error('Échec du déplacement audio avant suppression du livre', track.key, e);
                    audioFailures.push(track.name);
                }
            }
        }

        await prisma.book.delete({
            where: { id: bookId }
        });

        revalidateCatalogue();

        return NextResponse.json(
            { success: true, audioFailures },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error deleting book:', error);
        return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
    }
});
