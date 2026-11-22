/**
 * Natural ("human") comparison: digit runs compare numerically. Track order is
 * NOT derivable from a track number — folders variously use `1000 12- Titre`,
 * `1000  01 Titre` and date stamps like `1000 141201_1224.MP3` — but natural
 * ordering of the whole filename is correct for all of them.
 *
 * Three things are set aside before anything is compared, because lecteurs are
 * not consistent with them inside one folder and the order must not hang on it:
 *
 *  - **whitespace runs** collapse: the same folder mixes `1000    01` and
 *    `1000   03`, and otherwise the number of spaces would decide the order;
 *  - **the space between a word and its number** goes: `plage10` and
 *    `plage 00` sat side by side, and `plage10` played first, before 00 to 09
 *    (« Jazz Hot N°590 » and two others), as did `girard04` before `girard 02`;
 *  - **case and accents** in the text: `look 02` played before `Look 01`,
 *    `piste 05` before `Piste 01`, `PIste 07` after `Piste 08` — a lowercase
 *    letter sorted ahead before the track numbers were ever reached.
 *
 * Changing those three reordered 33 of the 11 702 live folders with two tracks
 * or more (November 2026), every one towards the order its own numbers give, and
 * none of the folders the portal has numbered itself. Only when two names are
 * equal under all three does the case-sensitive comparison decide, so the order
 * stays total and the same on every run.
 *
 * Pure string logic, no bucket access, no `server-only` — the one definition
 * shared by lib/audio/bucket-core.ts (server routes and scripts) and
 * lib/audio/naming.ts (also used client-side, e.g. folder-selection.ts, so it
 * can't itself depend on bucket-core.ts and its AWS SDK imports). Everything
 * that orders tracks must go through it: nextTrackName's guarantee that a new
 * name sorts last only holds if the listing is ordered by the same rule.
 */
export function naturalCompare(a: string, b: string): number {
    return compareRuns(a, b, true) || compareRuns(a, b, false);
}

const textOrder = new Intl.Collator('fr', { sensitivity: 'base' });
const textOrderExact = new Intl.Collator('fr');

function runsOf(s: string, loose: boolean): string[] {
    let t = s.replace(/\s+/g, ' ');
    if (loose) t = t.replace(/(\D) (?=\d)/g, '$1');
    return t.match(/\d+|\D+/g) ?? [];
}

function compareRuns(a: string, b: string, loose: boolean): number {
    const A = runsOf(a, loose);
    const B = runsOf(b, loose);
    const text = loose ? textOrder : textOrderExact;
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
        const x = A[i];
        const y = B[i];
        if (/^\d/.test(x) && /^\d/.test(y)) {
            const d = Number(x) - Number(y);
            if (d) return d;
        } else {
            const d = text.compare(x, y);
            if (d) return d;
        }
    }
    return A.length - B.length;
}
