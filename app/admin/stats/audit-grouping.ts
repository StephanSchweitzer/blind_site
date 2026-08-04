import { isReservedField } from '@/lib/audit/labels';
import type { AuditChangeMap, AuditEventItem } from '@/types';

/**
 * Folding the audit trail into readable rows.
 *
 * One act by one person is routinely several writes: saving a fiche, then the
 * bucket re-read that follows it, each landing as its own AuditEvent. The table
 * is append-only and stays exactly as written — this regroups them for display
 * only, and nothing here is ever persisted.
 *
 * Kept apart from audit-timeline.tsx because it is pure: no React, no fetch,
 * so it can be exercised on real sequences without rendering anything.
 */

/**
 * How far apart two edits of the same record may be and still read as one act.
 * Wide enough for someone filling a fiche, uploading audio and checking the
 * result; short enough that coming back after lunch starts a new block.
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Consecutive events shown as a single row. Usually exactly one event. */
export interface EventGroup {
    /** The newest event's id — what the expand state and the React key use. */
    key: number;
    /** Newest first, like the timeline itself. */
    events: AuditEventItem[];
    /** Net effect of the whole group: oldest « avant », newest « après ». */
    changes: AuditChangeMap;
}

/** The event a single-event group *is*, and the one a group is labelled by. */
export const headOf = (group: EventGroup): AuditEventItem => group.events[0];

/**
 * Net before → after across a burst.
 *
 * A field touched three times contributes one line, from where it started to
 * where it ended. A field that came back to its original value contributes
 * none — the burst as a whole did not change it, and saying otherwise would be
 * inventing a modification that never happened.
 */
export function netChanges(events: AuditEventItem[]): AuditChangeMap {
    const net: AuditChangeMap = {};
    // Oldest first, so each field keeps the earliest « avant » it was seen with.
    for (const event of [...events].reverse()) {
        for (const [field, [before, after]] of Object.entries(event.changes)) {
            net[field] = field in net ? [net[field][0], after] : [before, after];
        }
    }
    for (const [field, [before, after]] of Object.entries(net)) {
        if (before === after && !isReservedField(field)) delete net[field];
    }
    return net;
}

/**
 * Fold the timeline into display rows.
 *
 * Only *adjacent* events join, and only UPDATEs: a creation, a deletion and a
 * restoration are each a single act worth its own line, and a deletion also
 * carries the restore button. Staying adjacent means the visible order is never
 * rearranged — a block always covers one uninterrupted stretch of the journal.
 */
export function groupEvents(events: AuditEventItem[]): EventGroup[] {
    const groups: AuditEventItem[][] = [];

    for (const event of events) {
        const current = groups[groups.length - 1];
        const previous = current?.[current.length - 1];
        const joins =
            previous !== undefined &&
            previous.operation === 'UPDATE' &&
            event.operation === 'UPDATE' &&
            previous.model === event.model &&
            previous.recordId === event.recordId &&
            previous.actorId === event.actorId &&
            // Newest first, so `previous` is the later of the two.
            new Date(previous.at).getTime() - new Date(event.at).getTime() <= GROUP_WINDOW_MS;

        if (joins) current.push(event);
        else groups.push([event]);
    }

    return groups.map((events) => ({
        key: events[0].id,
        events,
        changes: events.length === 1 ? events[0].changes : netChanges(events),
    }));
}
