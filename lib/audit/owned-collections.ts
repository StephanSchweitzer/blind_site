import { getLanguageLabel } from '@/lib/user-enums';
import { formatAddressOneLine, type AddressLike } from '@/lib/users/formatAddress';

/**
 * Child tables that are not records — they are a FIELD of the row that owns them.
 *
 * An adresse and une langue de lecteur have no screen, no identity and no life
 * of their own: they exist only inside a fiche, and the fiche edits them the
 * only way a checkbox list can be edited — by replacing the whole set. Audited
 * as records, that replace-all is what the journal saw, and it read as nonsense:
 * saving a fiche without touching the address reported « Suppression · Adresse
 * n°412 », and changing one language reported five suppressions followed by a
 * creation of five rows, none of which anybody had decided.
 *
 * So they are traced against their OWNER instead. A write to one of these tables
 * produces no event of its own; it produces one line in the owner's diff, naming
 * the whole collection before and after — « Langues : Anglais, Espagnol →
 * Anglais ». That is one fact, it is the fact a human decided, and it folds into
 * the same « Modification · Personne » row as the rest of the save (see
 * app/admin/stats/audit-grouping.ts).
 *
 * The trade-off, stated: an individual adresse is no longer restorable from the
 * trail, because it is no longer recorded as a deletion. Replacing a set never
 * produced a restorable row worth having — the restore button offered to bring
 * back a row the very next write had already recreated.
 */

export interface OwnedCollection {
    /** Model the event is written against — the row this collection belongs to. */
    owner: string;
    /** Column on the child pointing at the owner. */
    ownerKey: string;
    /** Synthetic field the change is recorded under, inside the owner's diff. */
    field: string;
    /** Relations to load with each child row, when `describe` needs more than the row's own columns. */
    include?: Record<string, unknown>;
    /** One row → the words it contributes; null leaves it out entirely. */
    describe: (row: Record<string, unknown>) => string | null;
    /** What separates two entries once the collection is written out. */
    separator: string;
    /**
     * Trace what was added and removed rather than the whole set before and
     * after. Right for a set that grows long — a liste can hold dozens of books,
     * and one more of them is the fact, not the other forty. The diff then
     * carries `<field>Added` / `<field>Removed` (see COLLECTION_DELTAS in
     * ./labels), each side a JSON array of names.
     */
    delta?: {
        /** Which rows are the same entry, before and after — not its wording. */
        identify: (row: Record<string, unknown>) => string;
    };
    /**
     * Keep the collection in the owner's DELETE snapshot, so restoring the owner
     * brings it back too. Only meaningful when deleting the owner removes the
     * rows by cascade: a route that empties the collection first leaves nothing
     * for the snapshot to see.
     */
    restorable?: {
        /** French noun for one entry, singular and plural, for the restore message. */
        noun: [string, string];
    };
}

const text = (value: unknown): string | null =>
    typeof value === 'string' ? value.trim() || null : null;

export const OWNED_COLLECTIONS: Record<string, OwnedCollection> = {
    // Commas already separate an address's own parts, so entries are set apart
    // by something a postal address can never contain.
    Address: {
        owner: 'User',
        ownerKey: 'userId',
        field: 'addresses',
        describe: (row) => {
            const line = formatAddressOneLine(row as AddressLike);
            if (!line) return null;
            return row.isDefault === true ? `${line} (par défaut)` : line;
        },
        separator: ' · ',
    },

    ReaderLanguage: {
        owner: 'User',
        ownerKey: 'userId',
        field: 'languages',
        describe: (row) => {
            const language = text(row.language);
            return language === null ? null : getLanguageLabel(language);
        },
        separator: ', ',
    },

    // The books of a liste. A join row has no life of its own — adding a book to
    // a liste is an edit of the liste — so it is traced on the CoupsDeCoeur row,
    // as « Livres ajoutés » / « Livres retirés ». Identified by bookId, not by
    // title: two doublons can carry the same one.
    CoupsDeCoeurBooks: {
        owner: 'CoupsDeCoeur',
        ownerKey: 'coupsDeCoeurId',
        field: 'books',
        include: { book: { select: { title: true } } },
        describe: (row) => {
            const book = row.book as { title?: unknown } | null | undefined;
            const title = text(book?.title);
            if (title) return title;
            return typeof row.bookId === 'number' ? `Livre n°${row.bookId}` : null;
        },
        separator: ' · ',
        delta: { identify: (row) => String(row.bookId) },
        restorable: { noun: ['livre', 'livres'] },
    },
};

/** The collections whose rows travel in `owner`'s DELETE snapshot. */
export function restorableCollectionsOf(owner: string): Array<[string, OwnedCollection]> {
    return Object.entries(OWNED_COLLECTIONS).filter(
        ([, spec]) => spec.owner === owner && spec.restorable !== undefined
    );
}

/**
 * Snapshot key holding the owned rows of a deleted owner, as a JSON object
 * `{ ChildModel: [row, …] }` with the owner key left out. Underscored so it can
 * never be a column: the restore strips it before replaying the row.
 */
export const OWNED_SNAPSHOT_KEY = '_owned';

/**
 * What changed between two states of a delta-traced collection, as the two
 * diff lines it produces. Names are sorted; an entry is matched on
 * `delta.identify`, so a book retitled in between is neither added nor removed.
 */
export function collectionDelta(
    spec: OwnedCollection,
    before: Record<string, unknown>[],
    after: Record<string, unknown>[]
): Record<string, [string | null, string | null]> {
    const identify = spec.delta?.identify ?? ((row: Record<string, unknown>) => spec.describe(row) ?? '');
    const keysBefore = new Set(before.map(identify));
    const keysAfter = new Set(after.map(identify));
    const names = (rows: Record<string, unknown>[]) =>
        rows
            .map((row) => spec.describe(row))
            .filter((name): name is string => name !== null)
            .sort((a, b) => a.localeCompare(b, 'fr'));

    const added = names(after.filter((row) => !keysBefore.has(identify(row))));
    const removed = names(before.filter((row) => !keysAfter.has(identify(row))));

    const changes: Record<string, [string | null, string | null]> = {};
    if (removed.length > 0) changes[`${spec.field}Removed`] = [JSON.stringify(removed), null];
    if (added.length > 0) changes[`${spec.field}Added`] = [null, JSON.stringify(added)];
    return changes;
}

export function isOwnedCollection(model: string | undefined): boolean {
    return model !== undefined && model in OWNED_COLLECTIONS;
}

/**
 * A whole collection read as one value, or null when it is empty.
 *
 * Sorted rather than left in insertion order: these sets carry no order anybody
 * chose, and two identical collections written in a different order must compare
 * equal — otherwise re-saving a fiche would report a change that never happened.
 */
export function describeCollection(spec: OwnedCollection, rows: Record<string, unknown>[]): string | null {
    const parts = rows
        .map((row) => spec.describe(row))
        .filter((part): part is string => part !== null)
        .sort((a, b) => a.localeCompare(b, 'fr'));
    return parts.length === 0 ? null : parts.join(spec.separator);
}
