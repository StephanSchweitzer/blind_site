import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listRawObjects } from '@/lib/audio/bucket';
import { refreshBookAudioState, resolvePrefix, isKeyInsidePrefix } from '@/lib/audio/state';
import { softDeleteTracks } from '@/lib/audio/trash';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';

/** An upload that lands more than this far off the announced size is suspect. */
const SIZE_TOLERANCE_BYTES = 0;

/**
 * The reworked route runs ~6-7 round trips for a 50-file chunk (see the doc
 * comment above POST). The one path that can run long is a chunk where
 * several files land mis-sized: softDeleteTracks copies them to the
 * corbeille 10-wide, so up to 5 pooled batches on a worst-case all-mis-sized
 * chunk. 45s keeps real margin over that while staying inside the ~60s
 * that's configurable even on the smallest Vercel tier (the repo doesn't
 * record which plan this project is on; raise this if it turns out to allow
 * more).
 */
export const maxDuration = 45;

/**
 * Confirm what a direct-to-B2 upload actually put in the bucket.
 *
 * Because the browser PUTs straight to B2, the server never sees the write and
 * would otherwise have no idea whether it succeeded — leaving audioTrackCount
 * and audioLinkStatus stale, which is exactly the drift the cached columns exist
 * to avoid. So the client calls this once the batch finishes.
 *
 * ## One listing instead of one HEAD per file
 *
 * This used to `headTrack` every submitted key, then `create` its event row,
 * strictly serially — for a 50-file chunk, ~105 round trips including the
 * refresh below, which re-lists the same prefix a HEAD-per-key loop had just
 * finished asking about one key at a time. One `listRawObjects` answers every
 * membership/size question the loop needed, and is then handed to
 * `refreshBookAudioState` so it doesn't list a third time. Lands at roughly
 * 6-7 round trips for the same chunk: the listing, an idempotency check, one
 * `createMany`, and the refresh's own (parallel) queries.
 *
 * ## Idempotency
 *
 * `fetchJsonWithRetry` (hooks/useAudioUpload.ts) retries this call on a 5xx,
 * which can mean the first attempt's writes landed but its response was lost.
 * Re-running used to insert a second UPLOAD event per filename — harmless for
 * the duration sum (last-wins) but not for an append-only trail meant to
 * describe what actually happened. Filenames that already have an UPLOAD
 * event at the same size are skipped rather than re-recorded.
 *
 * ## Mis-sized uploads go through the corbeille now
 *
 * A key that lands at the wrong size used to be hard-deleted with
 * `deleteTrack` — the only unreviewed permanent delete on an admin path, in a
 * module whose whole doctrine is that every action is reversible. It now goes
 * through `softDeleteTracks`, the same batched copy-verify-then-remove path a
 * bulk delete takes: a wrong client-supplied `file.size` can park a good
 * object in the corbeille by mistake, never destroy it outright.
 */
export const POST = withAdmin(async (req, { params, me }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ message: 'Identifiant invalide' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const uploaded: { key?: unknown; size?: unknown; durationSeconds?: unknown }[] = Array.isArray(
        body?.uploaded,
    )
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
    const objects = prefix ? await listRawObjects(prefix) : [];
    const sizeByKey = new Map(objects.map((o) => [o.key, o.size]));

    interface Candidate {
        key: string;
        filename: string;
        sizeBytes: number;
        durationSeconds: number | null;
    }
    const candidates: Candidate[] = [];
    const misSized: { key: string; name: string; sizeBytes: number }[] = [];
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

        const actual = sizeByKey.get(key);
        if (actual === undefined) {
            failed.push({ key, reason: 'Absent du bucket — l’envoi a échoué' });
            continue;
        }
        if (expected >= 0 && Math.abs(actual - expected) > SIZE_TOLERANCE_BYTES) {
            misSized.push({ key, name: key.slice(prefix.length), sizeBytes: actual });
            failed.push({
                key,
                reason: `Taille incorrecte (${actual} au lieu de ${expected}) — fichier incomplet déplacé vers la corbeille`,
            });
            continue;
        }

        const durationSeconds =
            typeof u.durationSeconds === 'number' && Number.isFinite(u.durationSeconds) && u.durationSeconds > 0
                ? Math.round(u.durationSeconds)
                : null;
        candidates.push({ key, filename: key.slice(prefix.length), sizeBytes: actual, durationSeconds });
    }

    // Skip filenames a previous, retried attempt already recorded at the same
    // size — see the idempotency note above.
    const already = candidates.length
        ? await prisma.audioTrackEvent.findMany({
              where: { bookId, action: 'UPLOAD', filename: { in: candidates.map((c) => c.filename) } },
              select: { filename: true, sizeBytes: true },
          })
        : [];
    const alreadyRecorded = new Map<string, Set<string>>();
    for (const e of already) {
        const sizes = alreadyRecorded.get(e.filename) ?? new Set<string>();
        sizes.add(String(e.sizeBytes));
        alreadyRecorded.set(e.filename, sizes);
    }
    const fresh = candidates.filter((c) => !alreadyRecorded.get(c.filename)?.has(String(c.sizeBytes)));

    if (fresh.length) {
        await prisma.audioTrackEvent.createMany({
            data: fresh.map((c) => ({
                bookId,
                action: 'UPLOAD' as const,
                filename: c.filename,
                sizeBytes: BigInt(c.sizeBytes),
                durationSeconds: c.durationSeconds,
                performedById: me.id,
            })),
        });
    }

    if (misSized.length) {
        await softDeleteTracks({
            bookId,
            prefix,
            tracks: misSized,
            userId: me.id,
            // This route does its own combined refresh below, with a listing
            // it already holds — see refreshBookAudioState's `objects` param.
            skipFinalisation: true,
        });
    }

    const confirmed = candidates.map((c) => c.key);
    const misSizedKeys = new Set(misSized.map((m) => m.key));
    // The mis-sized keys were just moved out of the folder; reflect that in
    // the listing handed to the refresh below rather than listing again.
    const remainingObjects = objects.filter((o) => !misSizedKeys.has(o.key));

    // This is where the weight of a recording finally becomes known, so it is
    // also where the demandes still waiting on a tarif get theirs — the reader
    // returned the book long before, and the demande is already « Terminé ».
    const state = await refreshBookAudioState(bookId, me.id, true, remainingObjects);

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
        repriced: state.repriced,
    });
});
