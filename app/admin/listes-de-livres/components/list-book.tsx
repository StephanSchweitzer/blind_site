import React from 'react';
import { ListRef, membershipLabel } from './list-membership';

/** Un livre tel que la liste l'affiche — un sous-ensemble de la ligne Book. */
export interface ListBook {
    id: number;
    title: string;
    subtitle?: string | null;
    author: string;
    isbn?: string | null;
    createdAt: Date | string;
    available?: boolean;
    hiddenFromCatalogue?: boolean;
}

const BADGE = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4';

/**
 * Les signaux d'une ligne, en pastilles sous le titre plutôt qu'en colonnes :
 * ils ne concernent qu'une minorité de livres, et une colonne presque toujours
 * vide élargit le tableau pour rien.
 */
export function BookBadges({
    book,
    membership,
    inCurrentList = false,
}: {
    book: ListBook;
    membership?: ListRef[];
    inCurrentList?: boolean;
}) {
    const hasAny =
        !!book.subtitle || inCurrentList || !!membership?.length || book.hiddenFromCatalogue || book.available === false;
    if (!hasAny) return null;

    return (
        <div className="mt-0.5 space-y-1">
            {book.subtitle && <div className="text-xs text-muted-foreground">{book.subtitle}</div>}
            <div className="flex flex-wrap gap-1 empty:hidden">
                {inCurrentList && (
                    <span className={`${BADGE} bg-muted text-muted-foreground`}>Déjà dans la liste en cours</span>
                )}
                {membership && membership.length > 0 && (
                    <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}>
                        {membershipLabel(membership)}
                    </span>
                )}
                {book.available === false && (
                    <span className={`${BADGE} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`}>
                        En attente
                    </span>
                )}
                {book.hiddenFromCatalogue && (
                    <span className={`${BADGE} bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-300`}>
                        Masqué du catalogue public
                    </span>
                )}
            </div>
        </div>
    );
}

/**
 * Le statut d'une liste, identique dans le tableau et l'éditeur.
 *
 * « Visible » / « Masquée » plutôt que « Publiée » / « Brouillon » ou
 * « dépubliée » : l'interrupteur ne fait que montrer ou cacher la liste sur le
 * site. Une ancienne liste retirée n'est pas un brouillon, et une liste jamais
 * montrée n'a pas été « dépubliée ». C'est aussi le mot du catalogue
 * (« Masqué du catalogue public »).
 */
export function ListStatusBadge({ active }: { active: boolean }) {
    return active ? (
        <span className={`${BADGE} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`}>
            Visible
        </span>
    ) : (
        <span className={`${BADGE} bg-muted text-muted-foreground`}>Masquée</span>
    );
}
