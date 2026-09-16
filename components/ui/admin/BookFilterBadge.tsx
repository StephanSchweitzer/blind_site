'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, X } from 'lucide-react';
import { bookLabel } from '@/admin/BookSearchCombobox';

/**
 * Le badge du filtre « ce livre » (lib/books/bookFilter.ts). Toujours visible
 * quand le filtre s'applique : une liste restreinte à un livre sans le dire
 * ressemble à une liste incomplète.
 */
export function BookFilterBadge({
    book,
    noun,
}: {
    /** Le sous-titre distingue des volumes autrement identiques — voir BookFilter. */
    book: { id: number; title: string; subtitle?: string | null; author: string };
    /** « demandes » / « attributions » — ce que la liste montre. */
    noun: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const clear = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('bookId');
        params.set('page', '1');
        startTransition(() => router.push(`?${params.toString()}`));
    };

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
                Seules les {noun} du livre{' '}
                <span className="font-semibold">« {bookLabel(book)} »</span>
                {book.author && <span className="text-blue-800/80 dark:text-blue-300/80"> — {book.author}</span>}
                <span className="text-blue-800/80 dark:text-blue-300/80"> (n°{book.id})</span> sont affichées.
            </span>
            <button
                type="button"
                onClick={clear}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50"
            >
                <X className="h-4 w-4" aria-hidden />
                Retirer ce filtre
            </button>
        </div>
    );
}
