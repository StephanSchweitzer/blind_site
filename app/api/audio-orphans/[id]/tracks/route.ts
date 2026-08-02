import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listBookTracks, getTrackUrl } from '@/lib/audio/bucket';

/** Same TTL as the book audio manager — long enough to listen through a folder. */
const URL_TTL_SECONDS = 3600;

/**
 * The contents of one orphaned folder, so a permanent can *hear* it before
 * deciding which book it belongs to. Folder titles are frequently useless
 * (`22036  Guide de survie` holding a reading of another book entirely), and
 * guessing is how a recording ends up attached to the wrong catalogue entry.
 *
 * The prefix is read from the OrphanAudioFolder row, never taken from the
 * request: an admin-supplied prefix would turn this into a signed-URL generator
 * for any object in the bucket.
 */
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const orphanId = Number(id);
    if (!Number.isInteger(orphanId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const orphan = await prisma.orphanAudioFolder.findUnique({
        where: { id: orphanId },
        select: { id: true, prefix: true, title: true, folderNum: true },
    });
    if (!orphan) {
        return NextResponse.json({ message: 'Dossier introuvable' }, { status: 404 });
    }

    const tracks = await listBookTracks(orphan.prefix);
    const signed = await Promise.all(
        tracks.map(async (t) => ({
            ...t,
            url: await getTrackUrl(t.key, URL_TTL_SECONDS),
            downloadUrl: await getTrackUrl(t.key, URL_TTL_SECONDS, t.name),
        })),
    );

    return NextResponse.json({
        orphanId: orphan.id,
        prefix: orphan.prefix,
        title: orphan.title,
        folderNum: orphan.folderNum,
        expiresIn: URL_TTL_SECONDS,
        trackCount: signed.length,
        totalBytes: signed.reduce((t, s) => t + s.sizeBytes, 0),
        tracks: signed,
    });
});
