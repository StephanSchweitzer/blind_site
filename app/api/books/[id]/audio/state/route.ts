import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

/**
 * The cached audio state of one book — cheap enough to ask for on sight.
 *
 * The sibling /manage route answers the same question authoritatively, but it
 * lists the bucket and re-signs every track to do it. That is the right price
 * for opening the editor, and far too high for a badge that only has to say
 * whether a recording exists. So this route reads the columns the sync job and
 * every mutating route keep up to date, and touches nothing else.
 *
 * withAuth rather than withAdmin: knowing a book has audio is exactly what the
 * public catalogue already shows.
 */
export const GET = withAuth(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: {
            id: true,
            available: true,
            audioLinkStatus: true,
            audioTrackCount: true,
            audioCheckedAt: true,
        },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    return NextResponse.json({
        bookId: book.id,
        available: book.available,
        status: book.audioLinkStatus,
        trackCount: book.audioTrackCount,
        checkedAt: book.audioCheckedAt?.toISOString() ?? null,
    });
});
