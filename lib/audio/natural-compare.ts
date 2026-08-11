/**
 * Natural ("human") comparison: digit runs compare numerically. Track order is
 * NOT derivable from a track number — folders variously use `1000 12- Titre`,
 * `1000  01 Titre` and date stamps like `1000 141201_1224.MP3` — but natural
 * ordering of the whole filename is correct for all of them.
 *
 * Whitespace runs collapse first: the same folder mixes `1000    01` and
 * `1000   03`, and otherwise the number of spaces would decide the order.
 *
 * Pure string logic, no bucket access, no `server-only` — the one definition
 * shared by lib/audio/bucket-core.ts (server routes and scripts) and
 * lib/audio/naming.ts (also used client-side, e.g. folder-selection.ts, so it
 * can't itself depend on bucket-core.ts and its AWS SDK imports). The two
 * used to carry identical copies; they must agree exactly, since that
 * agreement is the whole point of the ordering check in `nextTrackName`.
 */
export function naturalCompare(a: string, b: string): number {
    const split = (s: string) => s.replace(/\s+/g, ' ').match(/\d+|\D+/g) ?? [];
    const A = split(a);
    const B = split(b);
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const x = A[i];
        const y = B[i];
        if (/^\d/.test(x) && /^\d/.test(y)) {
            const d = Number(x) - Number(y);
            if (d) return d;
        } else {
            const d = x.localeCompare(y, 'fr');
            if (d) return d;
        }
    }
    return A.length - B.length;
}
