import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { resolvePrefix } from '@/lib/audio/state';
import { listBookTracks } from '@/lib/audio/bucket';
import { softDeleteTrack, AudioTrashError } from '@/lib/audio/trash';

/**
 * Move every track in a book's folder to the corbeille, in one action.
 *
 * This is a loop over the same reviewed, reversible path as the single-track
 * delete (softDeleteTrack) — not a bucket-level folder delete — so every
 * track still gets its own copy-verify-then-remove sequence and its own
 * DeletedAudioTrack row, and one failed copy doesn't take the rest with it.
 *
 * The caller must echo back the current track count, re-checked here against
 * a fresh listing: a stale dialogue must not be able to wipe more (or fewer)
 * tracks than the admin actually saw when they confirmed.
 */
export const DELETE = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const confirmCount = Number(body?.confirmCount);

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    const prefix = resolvePrefix(book.audio_filepath);
    const tracks = prefix ? await listBookTracks(prefix) : [];

    if (!tracks.length) {
        return NextResponse.json(
            { message: 'Ce dossier ne contient aucune piste à supprimer.' },
            { status: 409 },
        );
    }

    if (confirmCount !== tracks.length) {
        return NextResponse.json(
            { message: 'La confirmation ne correspond pas au nombre de pistes actuel.' },
            { status: 409 },
        );
    }

    const deleted: string[] = [];
    const failed: { name: string; message: string }[] = [];

    // Sequential on purpose: each softDeleteTrack ends with a refresh of the
    // book's cached audio state, and running those concurrently would race on
    // the same row.
    for (const track of tracks) {
        try {
            await softDeleteTrack({
                bookId,
                key: track.key,
                filename: track.name,
                userId: me.id,
            });
            deleted.push(track.name);
        } catch (e) {
            if (e instanceof AudioTrashError) {
                failed.push({ name: track.name, message: e.message });
            } else {
                console.error('Suppression groupée audio échouée', track.key, e);
                failed.push({ name: track.name, message: 'Erreur inattendue.' });
            }
        }
    }

    return NextResponse.json({
        message:
            failed.length === 0
                ? `${deleted.length} piste${deleted.length > 1 ? 's' : ''} déplacée${deleted.length > 1 ? 's' : ''} dans la corbeille.`
                : `${deleted.length} piste${deleted.length > 1 ? 's' : ''} déplacée${deleted.length > 1 ? 's' : ''}, ${failed.length} échec${failed.length > 1 ? 's' : ''} — le${failed.length > 1 ? 's' : ''} fichier${failed.length > 1 ? 's' : ''} en échec ${failed.length > 1 ? 'sont restés' : 'est resté'} en place.`,
        deletedCount: deleted.length,
        failed,
    });
});
