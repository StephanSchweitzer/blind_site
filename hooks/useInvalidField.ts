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
export function useInvalidField() {
    const refs = useRef<Record<string, HTMLElement | null>>({});

    // Returns a ref callback. Attach to each required field's focusable element.
    const registerField = (name: string) => (el: HTMLElement | null) => {
        refs.current[name] = el;
    };

    const focusField = (el: HTMLElement | null) => {
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // focus after the smooth scroll settles
        setTimeout(() => {
            try {
                el.focus({ preventScroll: true });
            } catch {
                /* element may not be natively focusable; ignore */
            }
        }, 300);
        // transient highlight ring
        const ring = ["ring-2", "ring-red-500", "ring-offset-2", "ring-offset-gray-900"];
        el.classList.add(...ring);
        setTimeout(() => el.classList.remove(...ring), 2000);
    };

    /**
     * @param fieldOrder visual top→bottom order of field names
     * @param invalid    set of failing field names
     */
    const focusFirstInvalid = (fieldOrder: string[], invalid: Set<string>) => {
        const first = fieldOrder.find((n) => invalid.has(n));
        if (first) focusField(refs.current[first] ?? null);
    };

    return { registerField, focusField, focusFirstInvalid };
}
