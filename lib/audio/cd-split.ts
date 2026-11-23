/**
 * Where one CD ends and the next begins, for « Tout télécharger (ZIP) » split
 * into one folder per CD.
 *
 * Pure arithmetic — no React, no bucket — so it runs in the browser that builds
 * the archive and under plain Node in scripts/audio-naming.test.ts.
 *
 * ## By size only, in playback order
 *
 * Older folders sometimes carry `1000` / `2000` / `3000` leads that once marked
 * the CD breaks. They are deliberately **not** read here: guessing what a name
 * means behaves differently depending on a folder's history, and is fragile
 * (date-stamped names, a reader's `2000` buried mid-name by a portal upload).
 * One rule for every folder: the tracks in playback order, cut by size.
 *
 * Tracks are never reordered to fill a disc better. A CD that plays chapter 12
 * before chapter 11 is worse than a CD with room to spare.
 */

import { CD_CAPACITY_BYTES } from '../cd-capacity';
// What one CD holds is defined once, in lib/cd-capacity.ts — the same figure
// billing counts (lib/pricing.ts), so the CDs billed are the CDs burned.

export interface CdSplit {
    /**
     * Track indices per CD, contiguous and in playback order: concatenated, they
     * are 0, 1, 2… n-1. Empty when there is no track.
     */
    groups: number[][];
    /**
     * Tracks bigger than one CD. Each is alone in its group — it cannot be cut
     * and still play — and is reported so the interface can say so rather than
     * fail.
     */
    oversized: number[];
}

/**
 * Cut tracks, given by size in playback order, into as few CDs as possible —
 * then, with that number fixed, make the CDs as even as possible (the largest
 * one as small as it can be). 1,5 Go gives three CDs of about 500 Mo rather than
 * 720 + 720 + 60: same number of discs, and none of them filled to the brim.
 *
 * Contiguous linear partition. The greedy fill gives the minimum count for a
 * given ceiling, and that count only goes down as the ceiling goes up, so a
 * binary search on the ceiling finds the lowest one that keeps the minimum.
 *
 * A track bigger than the capacity is put alone and flagged; the runs of tracks
 * between such tracks are cut independently, each by the same rule.
 */
export function splitIntoCds(sizes: number[], capacity: number = CD_CAPACITY_BYTES): CdSplit {
    if (sizes.length === 0) return { groups: [], oversized: [] };

    const total = sizes.reduce((sum, s) => sum + s, 0);
    if (total <= capacity) return { groups: [sizes.map((_, i) => i)], oversized: [] };

    const groups: number[][] = [];
    const oversized: number[] = [];
    let runStart = 0;

    const closeRun = (end: number) => {
        if (end > runStart) groups.push(...balancedRun(sizes, runStart, end, capacity));
    };

    sizes.forEach((size, i) => {
        if (size <= capacity) return;
        closeRun(i);
        groups.push([i]);
        oversized.push(i);
        runStart = i + 1;
    });
    closeRun(sizes.length);

    return { groups, oversized };
}

/** How many contiguous groups the greedy fill makes over [start, end) under `ceiling`. */
function greedyCount(sizes: number[], start: number, end: number, ceiling: number): number {
    let count = 1;
    let filled = 0;
    for (let i = start; i < end; i++) {
        if (filled + sizes[i] > ceiling) {
            count++;
            filled = 0;
        }
        filled += sizes[i];
    }
    return count;
}

/** One run of tracks that each fit a CD: minimum count, then the lowest ceiling keeping it. */
function balancedRun(sizes: number[], start: number, end: number, capacity: number): number[][] {
    const cds = greedyCount(sizes, start, end, capacity);

    let lo = 0;
    for (let i = start; i < end; i++) lo = Math.max(lo, sizes[i]);
    let hi = capacity;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (greedyCount(sizes, start, end, mid) <= cds) hi = mid;
        else lo = mid + 1;
    }

    // Greedy under the lowest ceiling: exactly `cds` groups (never fewer — that
    // ceiling is at most the capacity, which already needed `cds`).
    const groups: number[][] = [];
    let current: number[] = [];
    let filled = 0;
    for (let i = start; i < end; i++) {
        if (current.length && filled + sizes[i] > lo) {
            groups.push(current);
            current = [];
            filled = 0;
        }
        current.push(i);
        filled += sizes[i];
    }
    groups.push(current);
    return groups;
}

/**
 * « CD 1 sur 3 ». Zero-padded from ten CDs on (« CD 01 sur 12 »), so the
 * folders sort in order in Windows Explorer and on a burner that orders by name.
 */
export function cdFolderName(index: number, count: number): string {
    const width = count >= 10 ? String(count).length : 1;
    return `CD ${String(index + 1).padStart(width, '0')} sur ${count}`;
}
