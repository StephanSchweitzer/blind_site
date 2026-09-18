'use client';

import React, { useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { toast } from '@/hooks/use-toast';

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

/** Same copy-and-confirm everywhere an id appears: check mark, sr announcement, toast. */
function useCopyIdHandler(value: string) {
    const { copied, copy } = useCopyToClipboard();

    const handleCopy = useCallback(
        (e: React.MouseEvent) => {
            // These sit inside dialog headers and clickable table rows — the
            // click would otherwise submit a form or open the row's modal.
            e.stopPropagation();
            void copy(value).then((ok) => {
                if (ok) toast({ title: `Identifiant #${value} copié dans le presse-papiers` });
            });
        },
        [copy, value]
    );

    return { copied, handleCopy };
}

/**
 * The badge form, for a dialog title: « Modifier la demande #1234 » where the
 * whole thing is the copy button. Nothing else in a modal header competes for
 * that click, so the generous hit area is free.
 */
export function CopyableId({ id, label, className }: CopyableIdProps) {
    const value = String(id);
    const { copied, handleCopy } = useCopyIdHandler(value);

    return (
        <span className={cn('inline-flex items-center', className)}>
            <button
                // type="button": these sit in dialog headers above a form, and a
                // bare <button> inside one submits it.
                type="button"
                onClick={handleCopy}
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
 * The id itself plus its icon, merged into one button, for a table row's ID
 * cell. Renders the « #1234 » text — callers no longer print it separately.
 *
 * Deliberately NOT the whole cell. Every one of these rows opens its edit modal
 * on click, so a cell-sized copy target would be a large invisible region that
 * behaves unlike the rest of the row — the user aims at the number expecting
 * the row to open and gets a clipboard write instead. This button reads as its
 * own control (hover brightens and slightly grows the text, reveals the icon,
 * shows a pill background) precisely so that expectation doesn't form; only
 * this small, visibly-a-control region deviates from "row opens the modal".
 *
 * It also fixes a smaller trap the old plain-text id had: a click event fires
 * on the row whenever mousedown and mouseup both land inside it, so dragging
 * across the id to select it opened the modal rather than selecting anything.
 *
 * `origin-left` keeps the hover scale from drifting the icon into the next
 * column; the negative margin cancels the hover padding so the id doesn't
 * nudge sideways at rest.
 */
export function CopyIdButton({ id, label, className }: CopyableIdProps) {
    const value = String(id);
    const { copied, handleCopy } = useCopyIdHandler(value);

    return (
        <>
            <button
                type="button"
                onClick={handleCopy}
                aria-label={`Copier l'identifiant ${label} ${value}`}
                title="Copier l'identifiant"
                className={cn(
                    'group/id -mx-1 inline-flex origin-left items-center gap-1 rounded px-1 py-0.5 align-middle',
                    'font-mono transition-[color,background-color,transform] duration-150',
                    // text-inherit, not text-foreground: some rows recolor this
                    // cell (orders-table's overdue red) and the button must not
                    // paint over that at rest — only the hover state below is
                    // its own opinion.
                    'text-inherit hover:scale-105 hover:bg-muted hover:text-blue-600 dark:hover:text-blue-400',
                    'focus-visible:scale-105 focus-visible:bg-muted focus-visible:text-blue-600 dark:focus-visible:text-blue-400',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    className
                )}
            >
                #{value}
                {copied ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                    <Copy
                        className={cn(
                            'h-3.5 w-3.5 shrink-0 transition-opacity duration-150',
                            // Hidden at rest: a dense table with one always-on icon
                            // per row is noise, and the id is read far more often
                            // than it's copied. Revealed by hovering/focusing THIS
                            // button, not the row — the id text is the affordance.
                            'opacity-0 group-hover/id:opacity-100 group-focus-visible/id:opacity-100',
                            '[@media(hover:none)]:opacity-100'
                        )}
                        aria-hidden="true"
                    />
                )}
            </button>
            <CopyAnnouncement copied={copied} />
        </>
    );
}
