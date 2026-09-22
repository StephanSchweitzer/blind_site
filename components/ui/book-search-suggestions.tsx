'use client';

import { BookOpen, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BookSearchSuggestion, CatalogueFilterKey } from '@/lib/books/book-suggestion-types';

interface PreviewBook {
    id: number;
    title: string;
    subtitle?: string | null;
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

const quoted = (labels: string[]) => labels.map((l) => `« ${l} »`).join(' et ');

const booksCount = (n: number) => `${n} livre${n > 1 ? 's' : ''}`;

/**
 * The catalogue's « Essayez plutôt » block — lib/books/book-suggestion-types.ts
 * says what it proposes and why it differs from the other lists'
 * SearchSuggestions.
 *
 * Each proposal is a card: what changes (a filter lifted, a word respelt or
 * removed), the books it finds — each one opens directly — and a button that
 * runs it. Separate buttons rather than one clickable card, because the book
 * and the search are two different destinations, and the people using this
 * should never have to guess which one a click leads to.
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

    return (
        <div className={cn('mx-auto max-w-xl space-y-3 pt-4 text-left', className)}>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
                Essayez plutôt :
            </p>
            {suggestions.map((suggestion) => {
                const lifted = suggestion.withoutFilters;
                const liftedLabels = lifted.map(filterLabel);
                const plural = lifted.length > 1;
                const withoutFilters = lifted.length > 0
                    ? ` sans ${plural ? 'les filtres' : 'le filtre'} ${quoted(liftedLabels)}`
                    : '';

                const heading =
                    suggestion.kind === 'filter' ? (
                        <>
                            {plural ? 'Les filtres' : 'Le filtre'} <strong>{quoted(liftedLabels)}</strong>{' '}
                            {plural ? 'cachent' : 'cache'} {suggestion.total > 1 ? 'ces livres' : 'ce livre'} :
                        </>
                    ) : suggestion.dropped !== undefined ? (
                        <>
                            Chercher sans <strong>« {suggestion.dropped} »</strong> :{' '}
                            <span className="font-medium">« {suggestion.query} »</span>
                            {withoutFilters}
                        </>
                    ) : (
                        <>
                            Vouliez-vous dire <strong>« {suggestion.query} »</strong> ?{withoutFilters}
                        </>
                    );

                const action =
                    suggestion.kind === 'filter'
                        ? `Retirer ${plural ? 'ces filtres' : 'ce filtre'} (${booksCount(suggestion.total)})`
                        // No number here: a correction is counted on titles and
                        // authors, the search it runs looks in descriptions too.
                        : (suggestion.total > suggestion.books.length
                            ? `Voir tous les livres pour « ${suggestion.query} »`
                            : `Chercher « ${suggestion.query} »`)
                          + (lifted.length > 0 ? ` sans ${plural ? 'ces filtres' : 'ce filtre'}` : '');

                return (
                    <section
                        key={`${suggestion.kind}:${suggestion.query}:${lifted.join(',')}`}
                        className="rounded-md border border-border bg-card px-4 py-3 text-foreground"
                    >
                        <p className="text-sm">{heading}</p>
                        <ul className="mt-2 space-y-1 list-none p-0">
                            {suggestion.books.map((book) => {
                                const note = bookNote?.(book, lifted);
                                return (
                                    <li key={book.id}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenBook(book)}
                                            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                            <span className="min-w-0">
                                                <span className="font-medium">{book.title}</span>
                                                <span className="text-muted-foreground"> — {book.author}</span>
                                                {note && (
                                                    <span className="ml-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                        {note}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                        <button
                            type="button"
                            onClick={() => onApply(suggestion)}
                            className="mt-2 w-full rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {action}
                        </button>
                    </section>
                );
            })}
        </div>
    );
}
