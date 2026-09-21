'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { BookSearchCombobox } from '@/admin/BookSearchCombobox';
import type { BookFilter } from '@/lib/books/bookFilter';
import { cn } from '@/lib/utils';

/**
 * Le champ du filtre « ce livre » (`?bookId=`, lib/books/bookFilter.ts).
 *
 * Le filtre existait déjà des deux côtés, mais sans commande : on n'y arrivait
 * que par un lien du catalogue (BookUsageLinks), et depuis la liste elle-même
 * il n'y avait aucun moyen de demander « les demandes du livre n°1234 ».
 *
 * Taper ce numéro dans la recherche n'en est pas un : il y désigne déjà une
 * demande (et, ici, une attribution), et les trois séries de numéros se
 * chevauchent — c'est la raison d'être du filtre séparé. Le sélecteur lève
 * l'ambiguïté AVANT de filtrer : on cherche par titre, auteur ou numéro
 * (/api/books remonte la fiche exacte en tête, voir promoteExactId dans
 * lib/books/bookList.ts) et on choisit un livre qu'on voit nommé, plutôt que de
 * taper un nombre en espérant la bonne lecture.
 *
 * Le filtre se retire à deux endroits : ici, à côté du champ où on l'a posé
 * (c'est là que le regard se porte pour le défaire), et au badge affiché en
 * dessous (BookFilterBadge), qui dit en plus ce que le champ ne dit pas — que
 * la liste est restreinte. Les deux font le même geste : supprimer `bookId`.
 */
export function BookFilterPicker({
    book,
    label,
    placeholder = 'Tous les livres',
    className,
}: {
    /** Le livre courant du filtre, résolu côté serveur. */
    book: BookFilter | null;
    /** Rendu au-dessus du champ, là où la liste étiquette ses filtres (demandes). */
    label?: string;
    placeholder?: string;
    className?: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const select = (bookId: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('bookId', String(bookId));
        // Le filtre change : la page 3 de l'ancienne liste n'a aucun sens ici.
        params.set('page', '1');
        startTransition(() => router.push(`?${params.toString()}`));
    };

    const clear = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete('bookId');
        params.set('page', '1');
        startTransition(() => router.push(`?${params.toString()}`));
    };

    return (
        <div className={cn('min-w-0', className)}>
            {label && (
                <label className="text-sm text-muted-foreground mb-1.5 block">{label}</label>
            )}
            <div className="flex items-center gap-1.5">
                <div className="min-w-0 flex-1">
                    <BookSearchCombobox
                        value={book}
                        onSelect={(selected) => {
                            select(selected.id);
                        }}
                        placeholder={placeholder}
                        triggerClassName={isPending ? 'opacity-50' : undefined}
                    />
                </div>
                {book && (
                    <button
                        type="button"
                        onClick={clear}
                        disabled={isPending}
                        title="Retirer le filtre par livre"
                        aria-label="Retirer le filtre par livre"
                        className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        <X className="h-4 w-4" aria-hidden />
                    </button>
                )}
            </div>
        </div>
    );
}
