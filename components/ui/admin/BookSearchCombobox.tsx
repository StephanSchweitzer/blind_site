'use client';

import React from 'react';
import { EntitySearchCombobox } from '@/admin/EntitySearchCombobox';

export interface BookSearchResult {
    id: number;
    title: string;
    author: string;
    /**
     * Present in every /api/books payload, and the only thing telling some
     * catalogue entries apart: the corpus holds several books recorded in
     * parts, identical down to the author, distinguished purely by « CD 1 et
     * 2 » / « CD 2 et 3 ». Optional so existing callers keep compiling.
     */
    subtitle?: string | null;
}

interface BookSearchComboboxProps<T extends BookSearchResult> {
    value: T | null;
    onSelect: (book: T) => boolean | void | Promise<boolean | void>;
    placeholder?: string;
    /** Trigger label; defaults to « Titre - Auteur ». */
    renderValue?: (book: T) => React.ReactNode;
    /** Result row; defaults to title (+ subtitle) over author. */
    renderItem?: (book: T) => React.ReactNode;
    triggerRef?: React.Ref<HTMLButtonElement>;
    triggerClassName?: string;
}

/**
 * « Titre — sous-titre », or just the title when there is no subtitle.
 * Both are trimmed: imported titles carry trailing spaces often enough that
 * joining them raw produces a visible double space.
 */
/**
 * 10 was too few to be worth scrolling and too few to trust: the corpus has
 * whole series that share a title, so a search could plausibly be truncated
 * before reaching the right volume. 25 fills the taller list, and the combobox
 * footer says when even that is capped.
 */
const BOOK_RESULT_LIMIT = 25;

export const bookLabel = (book: BookSearchResult): string => {
    const title = book.title.trim();
    const subtitle = book.subtitle?.trim();
    return subtitle ? `${title} — ${subtitle}` : title;
};

export function BookSearchCombobox<T extends BookSearchResult>({
    value,
    onSelect,
    placeholder = 'Rechercher un livre ...',
    renderValue,
    renderItem,
    triggerRef,
    triggerClassName,
}: BookSearchComboboxProps<T>) {
    const fetcher = async (query: string, signal: AbortSignal): Promise<T[]> => {
        const res = await fetch(
            `/api/books?search=${encodeURIComponent(query)}&limit=${BOOK_RESULT_LIMIT}`,
            { signal }
        );
        if (!res.ok) return [];
        const { books } = await res.json();
        return books;
    };

    return (
        <EntitySearchCombobox<T>
            value={value}
            onSelect={onSelect}
            fetcher={fetcher}
            getItemKey={(book) => book.id}
            renderValue={renderValue ?? ((book) => `${bookLabel(book)} - ${book.author}`)}
            renderItem={
                renderItem ??
                ((book) => (
                    <span className="flex items-start justify-between gap-2 w-full">
                        <span className="min-w-0 flex-1">
                            <span className="block font-medium">{book.title}</span>
                            {book.subtitle?.trim() && (
                                <span className="block text-sm text-foreground/80">{book.subtitle}</span>
                            )}
                            <span className="block text-sm text-muted-foreground">{book.author}</span>
                        </span>
                        {/* Shown for the same reason as in the other pickers:
                            the corpus holds near-identical entries that only an
                            id tells apart. */}
                        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            #{book.id}
                        </span>
                    </span>
                ))
            }
            resultLimit={BOOK_RESULT_LIMIT}
            resultNoun="livres"
            placeholder={placeholder}
            searchPlaceholder="Titre, auteur, ou numéro de livre..."
            emptyMessage="Aucun livre trouvé"
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
        />
    );
}
