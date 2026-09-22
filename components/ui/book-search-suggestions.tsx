'use client';

import { SearchRescue } from '@/components/ui/search-rescue';
import type { RescueRow } from '@/lib/search-suggestion-types';
import type { BookSearchSuggestion, CatalogueFilterKey } from '@/lib/books/book-suggestion-types';

interface PreviewBook {
    id: number;
    title: string;
    author: string;
}

interface BookSearchSuggestionsProps<B extends PreviewBook> {
    suggestions: BookSearchSuggestion<B>[] | null | undefined;
    /** How the page names one of its active filters: « Disponibles », « Rechercher dans : Titre »… */
    filterLabel: (key: CatalogueFilterKey) => string;
    /**
     * What sets a book apart from the lifted filters — « En attente » under
     * a lifted « Disponibles » — so the reader sees why it was hidden.
     */
    bookNote?: (book: B, lifted: CatalogueFilterKey[]) => string | null;
    /** Run the proposal: lift its filters, put its query in the box, search. */
    onApply: (suggestion: BookSearchSuggestion<B>) => void;
    onOpenBook: (book: B) => void;
    className?: string;
}

/**
 * The catalogue's « Essayez plutôt » block: the shared SearchRescue, fed whole
 * books. The rows stay books so a click can hand the page the very object it
 * opens (the public book modal needs the book, not its id); the filters are
 * named here, where the genre names are known.
 */
export function BookSearchSuggestions<B extends PreviewBook>({
    suggestions,
    filterLabel,
    bookNote,
    onApply,
    onOpenBook,
    className,
}: BookSearchSuggestionsProps<B>) {
    if (!suggestions || suggestions.length === 0) return null;

    const shown = suggestions.map((s) => ({
        ...s,
        rows: s.rows.map((book): RescueRow => ({
            id: book.id,
            title: book.title,
            detail: book.author,
            note: bookNote?.(book, s.lifted) ?? null,
        })),
    }));
    const original = (s: (typeof shown)[number]) => suggestions[shown.indexOf(s)];

    return (
        <SearchRescue
            suggestions={shown}
            unit={{ one: 'livre', many: 'livres' }}
            filterLabel={filterLabel}
            exactCorrectionCounts={false}
            onApply={(s) => onApply(original(s))}
            onOpenRow={(row, s) => {
                const book = original(s).rows.find((b) => b.id === row.id);
                if (book) onOpenBook(book);
            }}
            className={className}
        />
    );
}
