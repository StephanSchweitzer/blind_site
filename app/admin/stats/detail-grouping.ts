import type { StaffDetailItem } from '@/types';

/**
 * Folding the detail drawer into readable rows, the same idea as
 * audit-grouping.ts applied to `StaffDetailItem` instead of `AuditEventItem`.
 *
 * A single bulk action — uploading a folder of tracks, a script walking every
 * order in a batch — lands as one row per underlying record. Without folding,
 * a book with twelve tracks opens the drawer to twelve near-identical lines;
 * the journal at the bottom of the page avoids exactly that by grouping
 * bursts into one row with a count. This does the same for the drawer, and
 * generically: any metric whose consecutive items share a title and a type
 * within the window folds, not just audioEvents.
 *
 * Pure and display-only: the API response itself is never mutated.
 */

/** Mirrors GROUP_WINDOW_MS in audit-grouping.ts. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Consecutive items shown as a single row. Usually exactly one item. */
export interface DetailGroup {
    /** The group's first item's id — stable React key and expand-state key. */
    key: number;
    /** Chronological order, as returned by the API. */
    items: StaffDetailItem[];
}

export const headOf = (group: DetailGroup): StaffDetailItem => group.items[group.items.length - 1];

/**
 * Same underlying record and the same action on it — a book's tracks all
 * carry that book's title, so a burst of uploads for it shares (title, type);
 * a rename right after wouldn't join, since its type differs.
 */
function sameBurst(previous: StaffDetailItem, item: StaffDetailItem): boolean {
    return previous.title === item.title && (previous.type ?? null) === (item.type ?? null);
}

/**
 * Fold a bucket's detail items into display rows. Only *adjacent* items join,
 * so a block always covers one uninterrupted stretch of the list — the visible
 * order (chronological, as the API returns it) is never rearranged.
 */
export function groupDetailItems(items: StaffDetailItem[]): DetailGroup[] {
    const groups: StaffDetailItem[][] = [];

    for (const item of items) {
        const current = groups[groups.length - 1];
        const previous = current?.[current.length - 1];
        const joins =
            previous !== undefined &&
            sameBurst(previous, item) &&
            Math.abs(new Date(item.at).getTime() - new Date(previous.at).getTime()) <= GROUP_WINDOW_MS;

        if (joins) current.push(item);
        else groups.push([item]);
    }

    return groups.map((groupItems) => ({ key: groupItems[0].id, items: groupItems }));
}
