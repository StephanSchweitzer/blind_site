'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

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

/**
 * The « # » is decoration and is deliberately NOT copied.
 *
 * Staff search entities by pasting an id into the pickers, and
 * `/api/orders` parses that with `Number(...)` — so a copied « #1234 »
 * used to come back as zero results. The pickers and the routes both strip a
 * leading « # » defensively now (see `lib/search-query.ts`), but copying the
 * bare number keeps the paste correct everywhere else too — into Excel, an
 * email, or a URL.
 */
export function CopyableId({ id, label, className }: CopyableIdProps) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The confirmation is a timed state change, so it has to be cleaned up:
    // closing the modal mid-flash would otherwise setState on an unmounted tree.
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const value = String(id);

    /**
     * The deprecated-but-still-universal path. Kept because the modern API is
     * unavailable in more situations than it looks: `navigator.clipboard` is
     * undefined outside a secure context (plain http on the office LAN), and
     * where it does exist `writeText` still REJECTS when the permission is
     * denied. Both have to fall through to the same place.
     */
    const copyViaExecCommand = (): boolean => {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    };

    const handleCopy = async () => {
        let copiedOk = false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                copiedOk = true;
            }
        } catch {
            // Permission denied / not focused — fall through to execCommand.
        }
        if (!copiedOk) copiedOk = copyViaExecCommand();

        // If both fail we deliberately leave the check mark off rather than
        // confirming a copy that never happened. The number stays selectable
        // text, so a drag-select still gets it out by hand.
        if (!copiedOk) return;

        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
    };

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
            {/* Screen readers get the confirmation the check mark gives everyone
                else. Visually hidden, polite so it doesn't cut off the label. */}
            <span aria-live="polite" className="sr-only">
                {copied ? 'Identifiant copié' : ''}
            </span>
        </span>
    );
}
