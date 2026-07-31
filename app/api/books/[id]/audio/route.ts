import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listBookTracks, getTrackUrl } from '@/lib/audio/bucket';

/** How long the returned links stay valid. */
const URL_TTL_SECONDS = 3600;

/**
 * Ordered audio tracks for a book, each with a time-limited download URL.
 *
 * Authenticated users only — the bucket stays private and the B2 credentials
 * never leave the server; the browser only ever sees signed URLs that expire.
 */
export const GET = withAuth(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true, audio_filepath: true, audioLinkStatus: true },
    });

    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }
    if (!book.audio_filepath) {
        return NextResponse.json({ message: 'Aucun audio pour ce livre' }, { status: 404 });
    }

    const tracks = await listBookTracks(book.audio_filepath);
    if (!tracks.length) {
        // The folder resolves but holds no audio — the FOLDER_EMPTY case the
        // sync job records. Say so rather than returning a bare empty list.
        return NextResponse.json(
            { message: 'Le dossier audio est vide', status: book.audioLinkStatus },
            { status: 404 },
        );
    }

    const signed = await Promise.all(
        tracks.map(async (t) => ({ ...t, url: await getTrackUrl(t.key, URL_TTL_SECONDS) })),
    );

    return NextResponse.json({
        bookId: book.id,
        title: book.title,
        trackCount: signed.length,
        expiresIn: URL_TTL_SECONDS,
        tracks: signed,
    });
});
