'use client';

import React, { useEffect, useRef } from 'react';
import { useDelayedFlag } from '@/components/ui/inline-loading';

/** Label bars over input bars, roughly the shape of the forms it stands in for. */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
    return (
        <div className="space-y-6 py-2 animate-pulse" aria-hidden="true">
            {Array.from({ length: fields }, (_, i) => (
                <div key={i} className="space-y-2">
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-10 w-full rounded-md bg-muted" />
                </div>
            ))}
        </div>
    );
}

const FIRST_FIELD =
    'input:not([type=hidden]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), button[role=combobox]:not([disabled])';

/**
 * Stands in for a form until its data is there. While loading: `aria-busy`, a
 * `role="status"` « Chargement… » for screen readers, and — after
 * LOADING_DELAY_MS — the visible skeleton. Focus goes to the loading block
 * while it shows, then to the form's first field once the form mounts, so a
 * keyboard or screen-reader user is never left on whatever the dialog picked
 * while there was nothing to fill.
 *
 * Focusing on mount matters as much as on arrival: inside a Radix dialog our
 * effect runs before the dialog's own open-autofocus (child effects first),
 * which leaves focus alone when it already sits inside the content. Without it
 * a record that is ready by the time the dialog mounts lands on the header's
 * copy-id button.
 */
export function FormLoadingGate({
    loading,
    error,
    fields,
    children,
}: {
    loading: boolean;
    error?: string | null;
    fields?: number;
    children: React.ReactNode;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const loadingRef = useRef<HTMLDivElement>(null);
    // A fast answer goes straight to the form, no flash.
    const showSkeleton = useDelayedFlag(loading);

    useEffect(() => {
        if (error) return;
        if (loading) {
            loadingRef.current?.focus();
            return;
        }
        const container = containerRef.current;
        if (container && !container.contains(document.activeElement)) {
            container.querySelector<HTMLElement>(FIRST_FIELD)?.focus();
        }
    }, [loading, error]);

    if (error) {
        return (
            <div role="alert" className="px-3 py-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                {error}
            </div>
        );
    }

    if (loading) {
        return (
            <div ref={loadingRef} tabIndex={-1} aria-busy="true" className="min-h-[24rem] outline-none">
                <p role="status" className="sr-only">Chargement…</p>
                {showSkeleton && <FormSkeleton fields={fields} />}
            </div>
        );
    }

    return <div ref={containerRef}>{children}</div>;
}
