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
        const res = await fetch(`/api/books?search=${encodeURIComponent(query)}&limit=10`, { signal });
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
                    <>
                        <div className="font-medium">{book.title}</div>
                        {book.subtitle?.trim() && (
                            <div className="text-sm text-foreground/80">{book.subtitle}</div>
                        )}
                        <div className="text-sm text-muted-foreground">{book.author}</div>
                    </>
                ))
            }
            placeholder={placeholder}
            searchPlaceholder="Rechercher par titre ou auteur..."
            emptyMessage="Aucun livre trouvé"
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
        />
    );
}
