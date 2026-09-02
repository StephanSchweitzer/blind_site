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
    /** One row → the words it contributes; null leaves it out entirely. */
    describe: (row: Record<string, unknown>) => string | null;
    /** What separates two entries once the collection is written out. */
    separator: string;
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
};

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
