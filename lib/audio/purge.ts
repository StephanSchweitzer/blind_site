import 'server-only';

import { prisma } from '@/lib/prisma';
import { deleteTracks } from './bucket';

/**
 * Retention for the audio corbeille.
 *
 * A row older than this, never restored, not exempted, gets its bucket object
 * actually removed. See the DeletedAudioTrack doc comment in schema.prisma for
 * why `retainForever` exists: every row that predates this sweep shipping is
 * exempt, so the "restorable at any time" promise already shown for those
 * specific deletions keeps holding. Only deletions made after the sweep
 * shipped are ever subject to this window.
 */
export const AUDIO_TRASH_RETENTION_DAYS = 14;

/**
 * Rows handled per invocation. The backlog this sweep started with is exempt
 * (retainForever), so ongoing volume should be small — this bound exists so a
 * single cron invocation can't run indefinitely if that assumption ever stops
 * holding, e.g. a future bulk-delete spree.
 */
const BATCH_LIMIT = 200;

export interface AudioPurgeResult {
    purged: number;
    failed: number;
    /** Still-eligible rows this run didn't get to — next run picks them up. */
    remaining: number;
}

function retentionCutoff(): Date {
    return new Date(Date.now() - AUDIO_TRASH_RETENTION_DAYS * 86_400_000);
}

const eligibleWhere = (cutoff: Date) => ({
    restoredAt: null,
    purgedAt: null,
    retainForever: false,
    deletedAt: { lte: cutoff },
});

/**
 * Permanently remove the bucket object for every corbeille row past its
 * retention window, oldest first.
 *
 * Deletion is real here — unlike softDeleteTrack, there is no further copy to
 * fall back on. `deleteTracks` (batch DeleteObjects, same one the bulk
 * corbeille move uses) succeeds on a key that is already gone — S3-style
 * batch delete is idempotent per key — so a row surviving a previous partial
 * run (e.g. the bucket delete landed but the row update didn't) is simply
 * marked purged without erroring.
 *
 * This used to be `deleteTrack` then a row `update`, awaited one row at a
 * time — up to 400 sequential round trips for a full BATCH_LIMIT batch. One
 * DeleteObjects call (well under its 1000-key ceiling at this batch size) and
 * one `updateMany` do the same work in about three.
 */
export async function purgeExpiredAudioTrash(): Promise<AudioPurgeResult> {
    const cutoff = retentionCutoff();

    const due = await prisma.deletedAudioTrack.findMany({
        where: eligibleWhere(cutoff),
        orderBy: { deletedAt: 'asc' },
        take: BATCH_LIMIT,
        select: { id: true, trashKey: true },
    });

    if (!due.length) {
        return { purged: 0, failed: 0, remaining: 0 };
    }

    const { failed: failedKeys } = await deleteTracks(due.map((r) => r.trashKey));
    const failedKeySet = new Set(failedKeys);

    const purgedRows = due.filter((r) => !failedKeySet.has(r.trashKey));
    const failedRows = due.filter((r) => failedKeySet.has(r.trashKey));

    if (purgedRows.length) {
        await prisma.deletedAudioTrack.updateMany({
            where: { id: { in: purgedRows.map((r) => r.id) } },
            data: { purgedAt: new Date() },
        });
    }
    for (const row of failedRows) {
        console.error(`[purge-audio-trash] échec sur la ligne id=${row.id}`);
    }

    const remaining = await prisma.deletedAudioTrack.count({ where: eligibleWhere(cutoff) });

    return { purged: purgedRows.length, failed: failedRows.length, remaining };
}

export interface AudioPurgeNowResult {
    purged: number;
    /** The bucket refused these — the rows stay in the corbeille, restorable. */
    failed: number;
    /** Already restored or purged by the time the request arrived. */
    skipped: number;
}

/**
 * « Supprimer définitivement », from /admin/audio-corbeille: the same deletion
 * as the nightly sweep above, on rows a permanent named, without waiting for
 * the retention window.
 *
 * Exists because a take deleted on purpose — a bad recording, a duplicate —
 * otherwise sits in the book's corbeille for 14 days, counted in the audio
 * editor's « Corbeille (n) » and offered again by the book restore preview,
 * next to the files someone might genuinely want back.
 *
 * `retainForever` is NOT a refusal here: that flag exempts a row from the
 * *automatic* purge, so the old « restorable at any time » promise isn't
 * broken by a cron nobody watched. A human confirming the deletion row by row
 * is precisely the decision that flag was waiting for.
 *
 * Only active rows are touched — the `restoredAt`/`purgedAt` filter is
 * repeated on the update so a restore landing between the read and the write
 * isn't stamped purged. The ids come from the browser, but a corbeille row is
 * only ever addressed by its own id and `trashKey` is read from the database,
 * so a crafted id can at worst purge another corbeille row the caller could
 * already see on this screen — never a live track.
 */
export async function purgeTrashNow(opts: {
    trashIds: number[];
    userId: number;
}): Promise<AudioPurgeNowResult> {
    const ids = [...new Set(opts.trashIds)];
    if (!ids.length) return { purged: 0, failed: 0, skipped: 0 };

    const rows = await prisma.deletedAudioTrack.findMany({
        where: { id: { in: ids }, restoredAt: null, purgedAt: null },
        select: { id: true, trashKey: true },
    });
    const skipped = ids.length - rows.length;
    if (!rows.length) return { purged: 0, failed: 0, skipped };

    const { failed: failedKeys } = await deleteTracks(rows.map((r) => r.trashKey));
    const failedKeySet = new Set(failedKeys);
    const purgedRows = rows.filter((r) => !failedKeySet.has(r.trashKey));

    if (purgedRows.length) {
        await prisma.deletedAudioTrack.updateMany({
            where: { id: { in: purgedRows.map((r) => r.id) }, restoredAt: null, purgedAt: null },
            data: { purgedAt: new Date(), purgedById: opts.userId },
        });
    }
    for (const row of rows) {
        if (failedKeySet.has(row.trashKey)) {
            console.error(`[purge-audio-trash] suppression manuelle refusée, ligne id=${row.id}`);
        }
    }

    return { purged: purgedRows.length, failed: rows.length - purgedRows.length, skipped };
}
