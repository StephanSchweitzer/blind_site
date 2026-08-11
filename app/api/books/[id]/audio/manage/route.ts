import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listRawObjects, toOrderedTracks, getTrackUrl } from '@/lib/audio/bucket';
import { refreshBookAudioState, resolvePrefix, resolveTrackDurations } from '@/lib/audio/state';

/** Management links are short-lived; the dialogue refetches rather than caching. */
const URL_TTL_SECONDS = 3600;

/**
 * The audio folder of one book, as the management dialogue needs to see it.
 *
 * Deliberately separate from the sibling playback route (GET /audio, withAuth):
 *
 *  - that one 404s when the folder is empty, because there is nothing to play.
 *    Here an empty folder is a state to be *fixed*, so it must be returned.
 *  - that one hands out only what a player needs. This one exposes raw bucket
 *    keys, which are the target of upload and delete, and there is no reason to
 *    give those to every authenticated account.
 *
 * Admin-only, therefore, while playback stays open to any signed-in user —
 * auditeurs are the audience for these recordings.
 */
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: {
            id: true,
            title: true,
            author: true,
            audio_filepath: true,
            audioLinkStatus: true,
            audioTrackCount: true,
            audioCheckedAt: true,
            source_access_id: true,
        },
    });
    if (!book) {
        return NextResponse.json({ message: 'Livre non trouvé' }, { status: 404 });
    }

    const prefix = resolvePrefix(book.audio_filepath);

    // One listing for both: the state refresh and the track list used to list
    // the same prefix separately. `objects` is the prefix's full, unfiltered
    // listing — required for the refresh (see refreshBookAudioState) — and
    // toOrderedTracks derives the same ordered view listBookTracks would have.
    const objects = prefix ? await listRawObjects(prefix) : [];

    // Opening the dialogue is itself a check of the folder, so record it — this
    // is the cheapest way to keep the cached counters from drifting. The
    // duration itself is skipped: nothing about opening the dialogue can have
    // changed it, so re-summing and rewriting it here would just repeat what
    // the last upload/delete/rename/measure already wrote.
    const state = await refreshBookAudioState(bookId, null, false, objects);

    const tracks = toOrderedTracks(objects);
    const durations = tracks.length
        ? await resolveTrackDurations(bookId, new Map(tracks.map((t) => [t.name, t.sizeBytes])))
        : new Map<string, number | null>();
    const signed = await Promise.all(
        tracks.map(async (t) => ({
            ...t,
            durationSeconds: durations.get(t.name) ?? null,
            url: await getTrackUrl(t.key, URL_TTL_SECONDS),
            downloadUrl: await getTrackUrl(t.key, URL_TTL_SECONDS, t.name),
        })),
    );

    const trashCount = await prisma.deletedAudioTrack.count({
        where: { bookId, restoredAt: null },
    });

    return NextResponse.json({
        bookId: book.id,
        title: book.title,
        author: book.author,
        prefix,
        hasFolder: Boolean(prefix),
        status: state.status,
        checkedAt: new Date().toISOString(),
        expiresIn: URL_TTL_SECONDS,
        trackCount: signed.length,
        totalBytes: signed.reduce((t, s) => t + s.sizeBytes, 0),
        trashCount,
        tracks: signed,
    });
});
