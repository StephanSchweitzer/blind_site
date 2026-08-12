import { BULK_RECORD_ID } from '@/lib/audit/config';
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
 * A burst of AudioTrackEvent creations behind one bulk action — a folder
 * upload, or a "vider la corbeille" pass over every track in a book. Each row
 * is its own AudioTrackEvent, so recordId differs on every one of them and
 * could never match the way an UPDATE burst's does; the burst is instead the
 * same actor doing the same action (upload / rename / delete / restore) to
 * the same book, back to back.
 */
function sameAudioBurst(previous: AuditEventItem, event: AuditEventItem): boolean {
    if (previous.model !== 'AudioTrackEvent' || previous.operation !== 'CREATE' || event.operation !== 'CREATE') {
        return false;
    }
    // A batch event (recordId '*') already IS a whole operation — two folder
    // uploads of the same book back to back are two acts, not one burst, and
    // folding them would report one count for both.
    if (previous.recordId === BULK_RECORD_ID || event.recordId === BULK_RECORD_ID) return false;
    return (
        previous.changes.action?.[1] === event.changes.action?.[1] &&
        previous.changes.bookId?.[1] === event.changes.bookId?.[1]
    );
}

/**
 * Fold the timeline into display rows.
 *
 * Only *adjacent* events join. Two shapes of burst are recognised: several
 * UPDATEs of the same record (a creation, a deletion and a restoration are
 * each a single act worth its own line, and a deletion also carries the
 * restore button), and several AudioTrackEvent creations from the same bulk
 * action (see sameAudioBurst). Staying adjacent means the visible order is
 * never rearranged — a block always covers one uninterrupted stretch of the
 * journal.
 */
export function groupEvents(events: AuditEventItem[]): EventGroup[] {
    const groups: AuditEventItem[][] = [];

    for (const event of events) {
        const current = groups[groups.length - 1];
        const previous = current?.[current.length - 1];
        const joins =
            previous !== undefined &&
            previous.actorId === event.actorId &&
            previous.model === event.model &&
            // Newest first, so `previous` is the later of the two.
            new Date(previous.at).getTime() - new Date(event.at).getTime() <= GROUP_WINDOW_MS &&
            (
                (previous.operation === 'UPDATE' &&
                    event.operation === 'UPDATE' &&
                    previous.recordId === event.recordId) ||
                sameAudioBurst(previous, event)
            );

        if (joins) current.push(event);
        else groups.push([event]);
    }

    return groups.map((events) => ({
        key: events[0].id,
        events,
        // An audio burst's fields are each event's own filename and size, not
        // one value that moved across writes — netChanges would garble N
        // filenames into one bogus « avant / après » pair, so the head event's
        // own changes are kept instead and the timeline renders the burst as a
        // file list (see isAudioBurst).
        changes: events.length === 1 || events[0].model === 'AudioTrackEvent'
            ? events[0].changes
            : netChanges(events),
    }));
}

/**
 * True when `group` is a folded burst of AudioTrackEvent creations rather
 * than a single event or an UPDATE burst on one record — the timeline shows
 * these as a list of files, not a field-level diff.
 */
export function isAudioBurst(group: EventGroup): boolean {
    return group.events.length > 1 && headOf(group).model === 'AudioTrackEvent';
}

/**
 * True when `group` is a single AudioTrackEvent row standing for a whole BATCH
 * — a folder upload, a « vider le dossier ». Prisma's createMany returns no
 * rows, so the trail keeps the count and the fields every insert agreed on
 * (the book, the action) rather than one event per file: there is a diff table
 * to avoid rendering here, not a file list to show.
 */
export function isBulkAudio(group: EventGroup): boolean {
    const event = headOf(group);
    return event.model === 'AudioTrackEvent' && event.recordId === BULK_RECORD_ID;
}
