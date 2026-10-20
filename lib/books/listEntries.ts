/**
 * Les livres d'une liste tels que l'éditeur les envoie : chacun avec sa note
 * propre à cette liste (CoupsDeCoeurBooks.note). La même fiche dans une autre
 * liste a sa note à elle, ou aucune — d'où une colonne sur la table de liaison,
 * jamais sur Book : la note ne doit paraître ni au catalogue, ni sur la fiche,
 * ni dans l'annonce lue par Polly.
 */

/**
 * Une note s'imprime sous la présentation du livre, dans une notice que le PDF
 * garde d'un seul tenant (KEEP_TOGETHER_MAX_CHARS dans CoupDeCoeurPDF) : c'est
 * une précision, pas une seconde présentation.
 */
export const LIST_NOTE_MAX_LENGTH = 500;

export interface ListEntry {
    bookId: number;
    /** `undefined` : note laissée telle quelle (ancien client qui n'envoie que `bookIds`). */
    note?: string | null;
    /**
     * Rang du livre dans la liste (lib/books/listGenres.ts) ; null : ordre
     * alphabétique. `undefined` : rang laissé tel quel (client d'avant l'ordre).
     */
    position?: number | null;
}

/** Vide ou fait d'espaces : pas de note. */
export const normalizeListNote = (note: string | null | undefined): string | null => note?.trim() || null;

/**
 * Le corps d'une création ou d'un enregistrement de liste, lu en entrées.
 * `books: [{ bookId, note }]` depuis l'ajout des notes ; `bookIds` reste
 * accepté, sans toucher aux notes, pour un onglet ouvert avant le déploiement.
 * Null si le corps est inexploitable.
 */
export function parseListEntries(body: { books?: unknown; bookIds?: unknown }): ListEntry[] | null {
    if (Array.isArray(body.books)) {
        // Un livre n'est qu'une fois dans une liste : un doublon du corps garde sa dernière note.
        const entries = new Map<number, ListEntry>();
        for (const raw of body.books) {
            if (typeof raw !== 'object' || raw === null) return null;
            const { bookId, note, position } = raw as { bookId?: unknown; note?: unknown; position?: unknown };
            const id = Number(bookId);
            if (!Number.isInteger(id)) return null;
            if (note !== undefined && note !== null && typeof note !== 'string') return null;
            const normalized = normalizeListNote(note as string | null | undefined);
            if (normalized && normalized.length > LIST_NOTE_MAX_LENGTH) return null;
            if (position !== undefined && position !== null && !(Number.isInteger(position) && (position as number) >= 0)) {
                return null;
            }
            entries.set(id, { bookId: id, note: normalized, position: position as number | null | undefined });
        }
        return [...entries.values()];
    }
    if (Array.isArray(body.bookIds)) {
        const ids = body.bookIds.map((bookId) => Number(bookId));
        return ids.every(Number.isInteger) ? [...new Set(ids)].map((bookId) => ({ bookId })) : null;
    }
    return null;
}

/**
 * Les livres d'une liste que les visiteurs voient — sur le site comme dans la
 * liste imprimée : ni fiche supprimée (elle reste dans la liste, et revient si
 * elle est restaurée), ni livre masqué du catalogue public. Même règle que la
 * lecture publique (app/(public)/listes-de-livres/data.ts), pour les écrans du
 * back-office qui partent de la route d'édition, qui rend tout.
 */
export function visibleListEntries<T extends { book: { deletedAt?: unknown; hiddenFromCatalogue?: boolean } }>(
    entries: T[]
): T[] {
    return entries.filter(({ book }) => !book.deletedAt && !book.hiddenFromCatalogue);
}
