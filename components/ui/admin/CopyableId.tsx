'use client';

import React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

/**
 * The « # » is decoration and is deliberately NOT copied.
 *
 * Staff search entities by pasting an id into the pickers, and the routes
 * resolve one with `Number(...)`, which NaNs on a « # ». Both the pickers and
 * the routes strip it defensively now (`lib/search-query.ts`), but copying the
 * bare number keeps the paste correct everywhere else too — into Excel, an
 * email, or a URL.
 */

interface CopyableIdProps {
    /** The identifier itself. Rendered with a leading « # »; copied without it. */
    id: number | string;
    /**
     * The complete French noun phrase for the accessible label, article
     * included: « de la demande », « de l'attribution », « du livre ».
     * One prop rather than article + noun because French elision doesn't
     * survive being assembled from parts — « de l' attribution ».
     */
    label: string;
    className?: string;
}

/** Screen readers get the confirmation the check mark gives everyone else. */
function CopyAnnouncement({ copied }: { copied: boolean }) {
    return (
        <span aria-live="polite" className="sr-only">
            {copied ? 'Identifiant copié' : ''}
        </span>
    );
}

/**
 * The badge form, for a dialog title: « Modifier la demande #1234 » where the
 * whole thing is the copy button. Nothing else in a modal header competes for
 * that click, so the generous hit area is free.
 */
export function CopyableId({ id, label, className }: CopyableIdProps) {
    const { copied, copy } = useCopyToClipboard();
    const value = String(id);

    return (
        <span className={cn('inline-flex items-center', className)}>
            <button
                // type="button": these sit in dialog headers above a form, and a
                // bare <button> inside one submits it.
                type="button"
                onClick={() => void copy(value)}
                aria-label={`Copier l'identifiant ${label} ${value}`}
                title="Copier l'identifiant"
                className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-sm font-normal',
                    'text-muted-foreground transition-colors',
                    'hover:bg-muted hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
            >
                {/* select-text so the number can still be dragged out by hand
                    when the clipboard is unavailable. */}
                <span className="select-text">#{value}</span>
                {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                ) : (
                    <Copy className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                )}
            </button>
            <CopyAnnouncement copied={copied} />
        </span>
    );
}

/**
 * The icon-only form, for a table row's ID cell.
 *
 * Deliberately NOT the whole cell. Every one of these rows opens its edit modal
 * on click, so a cell-sized copy target would be a large invisible region that
 * behaves unlike the rest of the row — the user aims at the number expecting
 * the row to open and gets a clipboard write instead. Here the NUMBER keeps row
 * behaviour and only this icon, which visibly reads as a control, deviates.
 *
 * It also fixes a smaller trap: a click event fires on the row whenever
 * mousedown and mouseup both land inside it, so dragging across the id to
 * select it opens the modal rather than selecting anything. Reaching for this
 * button is the only way to get the number off the row without opening it —
 * which is very likely why staff were opening modals for an id in the first
 * place.
 *
 * The parent row needs the `group` class for the hover reveal.
 */
export function CopyIdButton({ id, label, className }: CopyableIdProps) {
    const { copied, copy } = useCopyToClipboard();
    const value = String(id);

    return (
        <>
            <button
                type="button"
                onClick={(e) => {
                    // The row's own onClick would otherwise open the modal —
                    // the exact thing this button exists to save.
                    e.stopPropagation();
                    void copy(value);
                }}
                aria-label={`Copier l'identifiant ${label} ${value}`}
                title="Copier l'identifiant"
                className={cn(
                    'inline-flex items-center justify-center rounded p-1 align-middle',
                    // One transition declaration, not two: `transition-opacity
                    // transition-colors` are the same CSS property, so the
                    // second silently wins and the reveal doesn't fade.
                    'text-muted-foreground transition-[opacity,color,background-color] duration-150',
                    'hover:bg-muted hover:text-foreground',
                    // Hidden until the row is hovered: a dense table with one
                    // always-on icon per row is noise, and the id column is
                    // read far more often than it's copied.
                    'opacity-0 group-hover:opacity-100',
                    // ...but never hidden from the keyboard, and never on a
                    // touch screen, where there is no hover to reveal it.
                    'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    '[@media(hover:none)]:opacity-100',
                    // A successful copy has to stay visible for its own
                    // confirmation, even if the pointer has since left.
                    copied && 'opacity-100',
                    className
                )}
            >
                {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
            </button>
            <CopyAnnouncement copied={copied} />
        </>
    );
}
