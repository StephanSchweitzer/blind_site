'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the "copied" confirmation stays up. */
const CONFIRM_MS = 1500;

interface UseCopyToClipboardResult {
    /** True for a moment after a copy that actually succeeded. */
    copied: boolean;
    copy: (value: string) => Promise<void>;
}

/**
 * Copy a string, with the confirmation state that goes with it.
 *
 * Two paths, because the modern API is unavailable in more situations than it
 * looks: `navigator.clipboard` is undefined outside a secure context (plain
 * http on the office LAN), and where it does exist `writeText` still REJECTS
 * when the permission is denied. Both fall through to the deprecated
 * execCommand path.
 *
 * When both fail, `copied` stays false — never confirm a copy that didn't
 * happen. Callers keep the value as selectable text so it can still be taken
 * out by hand.
 */
export function useCopyToClipboard(): UseCopyToClipboardResult {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The confirmation is a timed state change, so it has to be cleaned up:
    // unmounting mid-flash (closing the modal, paginating the table away)
    // would otherwise setState on an unmounted tree.
    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const copy = useCallback(async (value: string) => {
        let ok = false;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                ok = true;
            }
        } catch {
            // Permission denied / document not focused — try execCommand.
        }

        if (!ok) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = value;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                ok = document.execCommand('copy');
                document.body.removeChild(textarea);
            } catch {
                ok = false;
            }
        }

        if (!ok) return;

        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), CONFIRM_MS);
    }, []);

    return { copied, copy };
}
