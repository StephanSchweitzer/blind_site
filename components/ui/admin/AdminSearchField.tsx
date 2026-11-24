'use client';

import React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'type' | 'value' | 'onChange'>;

interface AdminSearchFieldProps extends InputProps {
    /** Ties the (screen-reader) label to the field. Unique on the page. */
    id: string;
    /** What the field searches, said by screen readers: « Rechercher une demande ». */
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    /** The × button. Defaults to emptying the field; pages that search on
     *  submit pass their own, which also reruns the empty search. */
    onClear?: () => void;
    /** A search-as-you-type page that is fetching: a spinner where the × sits. */
    busy?: boolean;
    /** Classes for the wrapper (width, flex), not the input. */
    className?: string;
}

/**
 * The search box of an admin list: magnifier, field, × to clear.
 *
 * Taken from the Demandes list, the one that had it whole. Each list wrote its
 * own copy, and most had only a placeholder: a screen reader announced « zone
 * de texte » and nothing else, and the hint vanished at the first letter typed
 * (cut off besides on a phone). Here the label is always there (sr-only, as on
 * Demandes), the field is `type="search"`, and the × is a labelled button.
 *
 * Only the field: the « Rechercher » button, the Enter key and the filters stay
 * with each page, which do not all search the same way (on submit, or as you
 * type).
 */
export const AdminSearchField = React.forwardRef<HTMLInputElement, AdminSearchFieldProps>(
    function AdminSearchField({ id, label, value, onValueChange, onClear, busy = false, className, disabled, ...inputProps }, ref) {
        return (
            <div className={cn('relative flex-1 min-w-0', className)}>
                <label htmlFor={id} className="sr-only">{label}</label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                    ref={ref}
                    id={id}
                    type="search"
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    disabled={disabled}
                    {...inputProps}
                    // The browser's own × would sit beside ours.
                    className="pl-10 pr-10 bg-card border-border text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
                />
                {busy && value ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : value ? (
                    <button
                        type="button"
                        onClick={onClear ?? (() => onValueChange(''))}
                        disabled={disabled}
                        aria-label="Effacer la recherche"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                ) : null}
            </div>
        );
    },
);
