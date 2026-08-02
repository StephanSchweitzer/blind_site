import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { headTrack, deleteTrack } from '@/lib/audio/bucket';
import { refreshBookAudioState, resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';

/** An upload that lands more than this far off the announced size is suspect. */
const SIZE_TOLERANCE_BYTES = 0;

/**
 * Confirm what a direct-to-B2 upload actually put in the bucket.
 *
 * Because the browser PUTs straight to B2, the server never sees the write and
 * would otherwise have no idea whether it succeeded — leaving audioTrackCount
 * and audioLinkStatus stale, which is exactly the drift the cached columns exist
 * to avoid. So the client calls this once the batch finishes.
 *
 * Each key is verified with HeadObject. An object that is missing or the wrong
 * size is reported back, and a wrong-size one is removed: a truncated upload is
 * a corrupt recording, and leaving it in place would make it look like a track.
 */
export const POST = withAdmin(async (req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const uploaded: { key?: unknown; size?: unknown }[] = Array.isArray(body?.uploaded)
        ? body.uploaded
        : [];

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { audio_filepath: true, available: true },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    const prefix = resolvePrefix(book.audio_filepath);
    const confirmed: string[] = [];
    const failed: { key: string; reason: string }[] = [];

    for (const u of uploaded) {
        const key = typeof u.key === 'string' ? u.key : '';
        const expected = typeof u.size === 'number' ? u.size : -1;

        // The client supplies these keys, so re-check containment rather than
        // trusting that they came from a URL we signed.
        if (!isKeyInsidePrefix(key, prefix)) {
            failed.push({ key, reason: 'Clé hors du dossier de ce livre' });
            continue;
        }

        const head = await headTrack(key);
        if (!head) {
            failed.push({ key, reason: 'Absent du bucket — l’envoi a échoué' });
            continue;
        }
        if (expected >= 0 && Math.abs(head.sizeBytes - expected) > SIZE_TOLERANCE_BYTES) {
            await deleteTrack(key);
            failed.push({
                key,
                reason: `Taille incorrecte (${head.sizeBytes} au lieu de ${expected}) — fichier incomplet supprimé`,
            });
            continue;
        }
        confirmed.push(key);
    }

    const state = await refreshBookAudioState(bookId);

    // A book left « en attente » only because nobody had recorded it yet. Now
    // that a track has landed, the reason is gone: publish it rather than make
    // someone remember to tick the box on a second screen. Conditioned on the
    // refreshed status, so a batch where every file failed verification does
    // not publish an empty folder.
    let becameAvailable = false;
    if (confirmed.length && !book.available && state.status === 'OK') {
        await prisma.book.update({ where: { id: bookId }, data: { available: true } });
        becameAvailable = true;
        revalidateAdmin();
        revalidateCatalogue();
    }

    return NextResponse.json({
        confirmed: confirmed.length,
        failed,
        status: state.status,
        trackCount: state.trackCount,
        becameAvailable,
    });
});
