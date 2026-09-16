'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
 * Le retrait reste au badge affiché juste en dessous (BookFilterBadge) : deux
 * boutons pour annuler le même filtre, l'un sous l'autre, ne feraient
 * qu'hésiter. Le badge dit en plus ce que le champ ne dit pas — que la liste
 * est restreinte.
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

    return (
        <div className={cn('min-w-0', className)}>
            {label && (
                <label className="text-sm text-muted-foreground mb-1.5 block">{label}</label>
            )}
            <BookSearchCombobox
                value={book}
                onSelect={(selected) => {
                    select(selected.id);
                }}
                placeholder={placeholder}
                triggerClassName={isPending ? 'opacity-50' : undefined}
            />
        </div>
    );
}
