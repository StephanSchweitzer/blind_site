import 'server-only';

import { prisma } from '@/lib/prisma';
import { deleteTrack } from './bucket';

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
 * fall back on. `deleteTrack` on B2's S3-compatible API succeeds even if the
 * key is already gone, so a row surviving a previous partial run (e.g. the
 * bucket delete landed but the row update didn't) is simply marked purged
 * without erroring.
 */
export async function purgeExpiredAudioTrash(): Promise<AudioPurgeResult> {
    const cutoff = retentionCutoff();

    const due = await prisma.deletedAudioTrack.findMany({
        where: eligibleWhere(cutoff),
        orderBy: { deletedAt: 'asc' },
        take: BATCH_LIMIT,
        select: { id: true, trashKey: true },
    });

    let purged = 0;
    let failed = 0;

    for (const row of due) {
        try {
            await deleteTrack(row.trashKey);
            await prisma.deletedAudioTrack.update({
                where: { id: row.id },
                data: { purgedAt: new Date() },
            });
            purged++;
        } catch (e) {
            failed++;
            console.error(`[purge-audio-trash] échec sur la ligne id=${row.id}`, e);
        }
    }

    const remaining = await prisma.deletedAudioTrack.count({ where: eligibleWhere(cutoff) });

    return { purged, failed, remaining };
}
