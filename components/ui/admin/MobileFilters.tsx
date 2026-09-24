'use client';

import React, { useId, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A list's filters, folded behind one « Filtres » button on a phone.
 *
 * Stacked one under the other, the five filters of the demandes filled the
 * whole first screen before a single row showed. On a phone they now open on
 * demand, and the button says how many are set, so a filtered list never passes
 * for the whole one. From `md` up nothing changes: the filters are always shown
 * and the button is gone.
 *
 * `className` is the layout of the filters themselves (the grid or flex row
 * each page already had).
 */
export function MobileFilters({
    activeCount,
    className,
    children,
}: {
    activeCount: number;
    className?: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const id = useId();

    return (
        <div>
            <Button
                type="button"
                variant="outline"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                className="w-full justify-between border-border bg-card text-foreground hover:bg-muted md:hidden"
            >
                <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    Filtres
                    {activeCount > 0 && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                            {activeCount}
                            <span className="sr-only"> {activeCount > 1 ? 'actifs' : 'actif'}</span>
                        </span>
                    )}
                </span>
                <ChevronDown
                    className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
                    aria-hidden="true"
                />
            </Button>
            <div id={id} className={cn(open ? 'mt-3 block' : 'hidden', 'md:mt-0 md:block')}>
                <div className={className}>{children}</div>
            </div>
        </div>
    );
}
