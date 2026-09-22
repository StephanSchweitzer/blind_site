import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { measureBookDurations, MeasureError } from '@/lib/audio/measure';
import { refreshBookAudioState } from '@/lib/audio/state';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';

/**
 * measure.ts reasons its own MAX_TRACKS=200 ceiling as "about thirty seconds
 * of work" at 8-way concurrency — that was a budget nobody had actually
 * written down as a function limit. 45s keeps a margin over that reasoned
 * figure for a folder near the ceiling, while staying inside the ~60s that's
 * configurable even on the smallest Vercel tier (the repo doesn't record
 * which plan this project is on; raise this if it turns out to allow more).
 */
export const maxDuration = 45;

/**
 * Recompute one book's reading duration from its audio files.
 *
 * The « Recalculer » button behind Durée de la lecture. Before this existed the
 * field could only be filled by uploading the folder through the portal, so a
 * permanent wanting a duration on an imported book had to download the recording
 * and send it back up purely to make the browser measure it.
 *
 * POST rather than GET: it reads several megabytes of range requests out of the
 * bucket and writes both the measurement cache and Book.readingDurationMinutes.
 * Nothing about it is safe to prefetch or retry blindly.
 *
 * The write goes through refreshBookAudioState rather than being done here, so
 * the derived column keeps exactly one writer and the all-or-nothing rule is
 * applied in exactly one place.
 */
export const POST = withAdmin(async (_req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    let result;
    try {
        result = await measureBookDurations(bookId);
    } catch (error) {
        // A refusal the measurement is sure about keeps its own status, and is
        // not logged: « ce livre n'existe pas » is an answer, not a fault, and
        // logging it as one buries the failures that are.
        if (error instanceof MeasureError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        // Anything else is the bucket or the database failing — worth recording,
        // and the only case worth trying again.
        console.error(`POST /api/books/${bookId}/audio/duration`, error);
        return NextResponse.json(
            { message: 'La mesure a échoué. Réessayez dans un instant.' },
            { status: 502 },
        );
    }

    // Read what was stored before touching anything, so the revalidation below
    // can tell a real move (including down to nothing) from a re-read that
    // confirms the same figure.
    const before = await prisma.book.findUnique({
        where: { id: bookId },
        select: { readingDurationMinutes: true },
    });

    // Re-read the folder so the duration lands next to a track count and weight
    // taken at the same moment, and so the cached columns cannot disagree with
    // the number just written. Called even when measureBookDurations found no
    // tracks at all: a book whose audio was removed still needs its stale
    // readingDurationMinutes cleared, not left describing files that are gone.
    const state = await refreshBookAudioState(bookId, me.id);
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { readingDurationMinutes: true },
    });

    // Worth invalidating whenever a figure reached the public pages, or just
    // stopped doing so — a duration cleared to null is as much a change to the
    // catalogue as one newly filled in.
    if (book?.readingDurationMinutes != null || before?.readingDurationMinutes != null) {
        revalidateAdmin();
        revalidateCatalogue();
    }

    return NextResponse.json({
        readingDurationMinutes: book?.readingDurationMinutes ?? null,
        totalSeconds: result.totalSeconds,
        measured: result.measured,
        failed: result.failed,
        fromCache: result.fromCache,
        trackCount: state.trackCount,
        repriced: state.repriced,
        // Only the failures: naming forty files that worked is noise, and the
        // ones that did not are the only thing anybody can act on.
        problems: result.tracks
            .filter((t) => t.seconds === null)
            .map((t) => ({ filename: t.filename, problem: t.problem })),
    });
});
