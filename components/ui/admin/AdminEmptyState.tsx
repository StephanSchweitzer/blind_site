import React from 'react';
import { FilterX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What an admin table shows when it has no row: one sentence, a way out of an
 * over-filtered list, and below them the « Essayez plutôt » suggestions
 * (SearchRescue, passed as children).
 *
 * Taken from the Demandes list. Each table wrote its own — a dashed box, bare
 * grey text, a card, a row inside the table — and only Demandes offered to lift
 * the filters from there. Pass `onClearFilters` only when a filter is set and no
 * suggestion already says what to lift.
 */
export function AdminEmptyState({
    message,
    onClearFilters,
    children,
    className,
}: {
    message: React.ReactNode;
    onClearFilters?: () => void;
    children?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('rounded-lg border border-dashed border-border px-4 py-12 text-center', className)}>
            <p className="text-lg text-muted-foreground">{message}</p>
            {onClearFilters && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={onClearFilters}
                    className="mt-4 border-border bg-card text-foreground hover:bg-muted"
                >
                    <FilterX className="h-4 w-4" aria-hidden="true" />
                    Effacer les filtres
                </Button>
            )}
            {children}
        </div>
    );
}
