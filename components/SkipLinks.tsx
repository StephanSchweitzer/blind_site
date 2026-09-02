'use client';

import React from 'react';

type SkipTarget = { id: string; label: string };

const TARGETS: SkipTarget[] = [
    { id: 'contenu-principal', label: 'Aller au contenu principal' },
    { id: 'navigation-principale', label: 'Aller à la navigation' },
];

/**
 * RGAA 12.7 — the first tab stops on every page.
 *
 * The plain `href="#id"` form is kept as the no-JS fallback, but focus is moved
 * explicitly rather than left to fragment navigation, for two reasons:
 *
 *  - Fragment navigation only *scrolls*; whether it also moves focus has never
 *    been consistent across browsers, and a skip link that scrolls without
 *    moving focus does nothing for a screen-reader or keyboard user — the next
 *    Tab press resumes from the header they were trying to skip.
 *  - Next.js streams the page inside `<div hidden id="S:n">` buffers during
 *    hydration, so `#contenu-principal` can resolve to a copy of the target
 *    that is display:none. Selecting the live node explicitly sidesteps that.
 */
export function SkipLinks() {
    const skipTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        // Pick the node that is actually rendered, not a streaming buffer copy.
        const target = Array.from(document.querySelectorAll<HTMLElement>(`#${id}`))
            .find((el) => !el.closest('[hidden]'));
        if (!target) return;

        event.preventDefault();
        // Landmarks are not focusable on their own; -1 makes them a focus target
        // without adding them to the tab order.
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
    };

    return (
        <>
            {TARGETS.map(({ id, label }) => (
                <a key={id} href={`#${id}`} className="skip-link" onClick={(e) => skipTo(e, id)}>
                    {label}
                </a>
            ))}
        </>
    );
}
