'use client';

import React from 'react';
import { EntitySearchCombobox } from '@/admin/EntitySearchCombobox';

export interface BookSearchResult {
    id: number;
    title: string;
    author: string;
}

interface BookSearchComboboxProps<T extends BookSearchResult> {
    value: T | null;
    onSelect: (book: T) => boolean | void | Promise<boolean | void>;
    placeholder?: string;
    /** Trigger label; defaults to « Titre - Auteur ». */
    renderValue?: (book: T) => React.ReactNode;
    triggerRef?: React.Ref<HTMLButtonElement>;
    triggerClassName?: string;
}

export function BookSearchCombobox<T extends BookSearchResult>({
    value,
    onSelect,
    placeholder = 'Rechercher un livre ...',
    renderValue,
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
            renderValue={renderValue ?? ((book) => `${book.title} - ${book.author}`)}
            renderItem={(book) => (
                <>
                    <div className="font-medium">{book.title}</div>
                    <div className="text-sm text-muted-foreground">{book.author}</div>
                </>
            )}
            placeholder={placeholder}
            searchPlaceholder="Rechercher par titre ou auteur..."
            emptyMessage="Aucun livre trouvé"
            triggerRef={triggerRef}
            triggerClassName={triggerClassName}
        />
    );
}
