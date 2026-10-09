'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** How long a load may take before anything says so: a fast answer arrives with no flash. */
export const LOADING_DELAY_MS = 200;

/** `active`, but only once it has stayed true for `delayMs`. */
export function useDelayedFlag(active: boolean, delayMs = LOADING_DELAY_MS): boolean {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        if (!active) return;
        const timer = setTimeout(() => setShown(true), delayMs);
        return () => {
            clearTimeout(timer);
            setShown(false);
        };
    }, [active, delayMs]);
    return active && shown;
}

/**
 * A side block's « Vérification… » line. It takes its line from the first render
 * — invisible until LOADING_DELAY_MS, so the answer replaces it without the form
 * jumping — and announces itself to screen readers as a status.
 */
export function InlineLoading({ label = 'Vérification…', className }: { label?: string; className?: string }) {
    const visible = useDelayedFlag(true);
    return (
        <span
            role="status"
            className={cn(
                'inline-flex items-center gap-1.5 text-sm text-muted-foreground',
                !visible && 'invisible',
                className,
            )}
        >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {label}
        </span>
    );
}
