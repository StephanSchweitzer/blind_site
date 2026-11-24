"use client";

import { useRef } from "react";

/**
 * N3 — scroll to + highlight the first invalid required field on submit.
 *
 * Pattern per form:
 *   const { registerField, focusFirstInvalid } = useInvalidField();
 *   // attach to each required field's *focusable* element:
 *   <Input ref={registerField('title')} ... />
 *   // for Radix Select/Popover/date triggers, target the trigger button;
 *   // for non-focusable wrappers, add tabIndex={-1}.
 *
 *   const invalid = validate();            // string[] of failing field names, in field order
 *   if (invalid.length) {
 *     toastError(messageFor(invalid[0])); // N2
 *     focusFirstInvalid(FIELD_ORDER, new Set(invalid));
 *     return;
 *   }
 */
/**
 * The reason, for screen readers, of the field focusFirstInvalid lands on.
 * Forms say why only in a toast (N2 — no red box repeated in the form), and a
 * toast is far from the field: someone who tabs back to it later heard a bare
 * « Auditeur » again, with nothing saying it was the one at fault. One
 * visually-hidden node for the whole page, referenced by that field's
 * aria-describedby; a description is read even from a node the open dialog
 * hides, so it can live on <body>.
 */
const MESSAGE_ID = 'invalid-field-message';

function messageNode(): HTMLElement {
    let node = document.getElementById(MESSAGE_ID);
    if (!node) {
        node = document.createElement('span');
        node.id = MESSAGE_ID;
        node.className = 'sr-only';
        document.body.appendChild(node);
    }
    return node;
}

/** Undoes what markInvalid did to one field. */
function clearInvalid(el: HTMLElement) {
    el.removeAttribute('aria-invalid');
    const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== MESSAGE_ID);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
}

export function useInvalidField() {
    const refs = useRef<Record<string, HTMLElement | null>>({});
    const marked = useRef<HTMLElement[]>([]);

    // Returns a ref callback. Attach to each required field's focusable element.
    const registerField = (name: string) => (el: HTMLElement | null) => {
        refs.current[name] = el;
    };

    /**
     * Every failing field says so (`aria-invalid`), and the first one also says
     * why. Set by hand rather than through React state: the forms only hold
     * refs to these fields, and a native field is cleared at the next keystroke
     * (a picker or a select, at the next submit).
     */
    const markInvalid = (invalid: Set<string>, first: string | undefined, message?: string) => {
        for (const el of marked.current) clearInvalid(el);
        marked.current = [];
        for (const name of invalid) {
            const el = refs.current[name];
            if (!el) continue;
            el.setAttribute('aria-invalid', 'true');
            el.addEventListener('input', () => clearInvalid(el), { once: true });
            marked.current.push(el);
        }
        const firstEl = first ? refs.current[first] : null;
        if (firstEl && message) {
            messageNode().textContent = message;
            const ids = (firstEl.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
            if (!ids.includes(MESSAGE_ID)) firstEl.setAttribute('aria-describedby', [...ids, MESSAGE_ID].join(' '));
        }
    };

    const focusField = (el: HTMLElement | null) => {
        if (!el) return;
        // Instant, not smooth: the site never animates scrolling — a long animated
        // scroll disorients screen-magnifier users, a core audience here.
        el.scrollIntoView({ block: "center" });
        try {
            el.focus({ preventScroll: true });
        } catch {
            /* element may not be natively focusable; ignore */
        }
        // transient highlight ring
        const ring = ["ring-2", "ring-red-500", "ring-offset-2", "ring-offset-gray-900"];
        el.classList.add(...ring);
        setTimeout(() => el.classList.remove(...ring), 2000);
    };

    /**
     * @param fieldOrder visual top→bottom order of field names
     * @param invalid    set of failing field names
     * @param message    the toast's text — read out again with the field focused
     */
    const focusFirstInvalid = (fieldOrder: string[], invalid: Set<string>, message?: string) => {
        const first = fieldOrder.find((n) => invalid.has(n));
        // Marked before the focus moves, so the field is announced with its reason.
        markInvalid(invalid, first, message);
        if (first) focusField(refs.current[first] ?? null);
    };

    return { registerField, focusField, focusFirstInvalid };
}
