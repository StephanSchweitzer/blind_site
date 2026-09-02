/**
 * Search-box query helpers shared by the admin pickers and the API routes.
 *
 * Deliberately free of any Prisma / server import: the comboboxes are client
 * components and normalize the query before it ever reaches `fetch`, while the
 * routes normalize again on the way in — neither can trust the other to have
 * done it (a demande id typed straight into the URL bar, say).
 */

/**
 * Strip the decoration staff paste around an identifier.
 *
 * The edit modals render ids as « #1234 » (see `CopyableId`), and staff copy
 * that string wholesale into a picker. `Number('#1234')` is NaN, so before this
 * existed the id workflow they invented silently returned zero results for the
 * exact value the UI had just handed them.
 */
export function normalizeSearchQuery(raw: string): string {
    return raw.trim().replace(/^#+\s*/, '').trim();
}

/**
 * The French noun staff type ahead of a number from memory — « demande 1234 ».
 *
 * Only ever stripped by `parseEntityId`, and only when everything after it is
 * digits. Stripping it in `normalizeSearchQuery` would be a trap: this route is
 * shared with the public catalogue, where « livre de poche » is a real title
 * search that must not become « de poche ».
 */
const ID_PREFIX = /^(?:demandes?|attributions?|livres?|personnes?|factures?|paiements?)\s+(?=\d+$)/i;

/**
 * The query as a positive integer id, or null when it isn't one.
 *
 * Callers OR this into their text search rather than branching on it: an
 * all-digit query can legitimately match a phone number or a title, so an id
 * hit must widen the result set, never replace it.
 */
export function parseEntityId(query: string): number | null {
    const normalized = normalizeSearchQuery(query).replace(ID_PREFIX, '');
    if (!/^\d+$/.test(normalized)) return null;
    const id = Number(normalized);
    // Beyond Postgres' int4 ceiling the query would throw rather than miss.
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) return null;
    return id;
}

/**
 * Whether a query is long enough to search.
 *
 * A bare id is exempt from the `minLength` floor: demande #7 is a real record,
 * and making its owner type a second character to find it is the kind of
 * papercut that sends people back to scrolling the table.
 */
export function meetsSearchMinLength(raw: string, minLength: number): boolean {
    const normalized = normalizeSearchQuery(raw);
    if (normalized.length === 0) return false;
    if (parseEntityId(normalized) !== null) return true;
    return normalized.length >= minLength;
}
