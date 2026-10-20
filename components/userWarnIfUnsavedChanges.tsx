'use client';

import { useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRouterInstance, NavigateOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useConfirm, type ConfirmOptions } from '@/components/ui/confirm-dialog';

/**
 * Unsaved-work guard: every way of leaving the page the app owns asks through
 * the site's own dialogue (useConfirm) — link clicks, Précédent / Suivant,
 * `router.push` / `router.replace`, and sign-out via `confirmLeavingPage`.
 *
 * Only closing the tab, reloading, or typing an address still shows the
 * browser's prompt: `beforeunload` is the one exit no page may restyle, and
 * dropping it would lose the work without a word.
 *
 * One controller for the whole page, however many hooks are mounted — two
 * guards each pushing history entries and each patching the router would
 * fight. Hooks only register whether they hold unsaved work.
 */

const DEFAULT_PROMPT: ConfirmOptions = {
    title: 'Modifications non enregistrées',
    description: 'Vous avez des modifications non enregistrées. Si vous quittez la page, elles seront perdues.',
    confirmLabel: 'Quitter la page',
    cancelLabel: 'Rester sur la page',
    destructive: true,
};

/** Marks the extra history entry that catches Précédent. */
const GUARD_KEY = '__ecaUnsavedGuard';

type Guard = { active: boolean; prompt: ConfirmOptions };
type RouterMethod = (href: string, options?: NavigateOptions) => void;

const guards = new Map<string, Guard>();
let confirmFn: ((options: ConfirmOptions) => Promise<boolean>) | null = null;
let patchedRouter: AppRouterInstance | null = null;
let originalPush: RouterMethod | null = null;
let originalReplace: RouterMethod | null = null;

/**
 * Set once the permanent chose to leave: the navigation that follows must not
 * be asked about again, nor trip `beforeunload`. Lifted after a moment in case
 * that navigation kept the guarding component mounted.
 */
let leaving = false;
let leavingTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Précédent can't be cancelled — by the time `popstate` fires the browser has
 * already moved. So while work is unsaved, a copy of the current entry sits on
 * top of the history: Précédent lands on the same page, and the dialogue
 * decides whether to take the real step back.
 */
let armed = false;
let homeUrl = '';
let homeState: unknown = null;
/** The silent step back that removes the copy once nothing is unsaved. */
let swallow: { url: string; resolve: () => void } | null = null;
let pendingDisarm: Promise<void> | null = null;

function activeGuard(): Guard | null {
    if (leaving) return null;
    for (const guard of guards.values()) if (guard.active) return guard;
    return null;
}

function ask(): Promise<boolean> {
    const guard = activeGuard();
    if (!guard || !confirmFn) return Promise.resolve(true);
    return confirmFn(guard.prompt);
}

function release(ms = 1500) {
    leaving = true;
    clearTimeout(leavingTimer);
    leavingTimer = setTimeout(() => {
        leaving = false;
        syncHistory();
    }, ms);
}

function samePage(href: string): boolean {
    const url = new URL(href, window.location.href);
    return (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search
    );
}

function pushCopy() {
    // The copy keeps Next's own state (`__NA`, tree): its patched pushState
    // then lets it through untouched, and a restore onto it renders this page.
    window.history.pushState({ ...(homeState as object | null), [GUARD_KEY]: true }, '', homeUrl);
    armed = true;
}

async function arm() {
    if (pendingDisarm) await pendingDisarm;
    if (armed || !activeGuard()) return;
    homeUrl = window.location.href;
    homeState = window.history.state;
    pushCopy();
}

function disarm(): Promise<void> {
    if (!armed) return pendingDisarm ?? Promise.resolve();
    armed = false;
    // Navigated elsewhere without us (a redirect): the copy is no longer on top.
    if (window.location.href !== homeUrl) return Promise.resolve();
    const url = homeUrl;
    const done = new Promise<void>((resolve) => {
        swallow = { url, resolve };
        window.history.back();
        // A traversal the browser never reports must not hold navigation hostage.
        setTimeout(() => {
            if (swallow?.resolve === resolve) swallow = null;
            resolve();
        }, 2000);
    });
    const wrapped: Promise<void> = done.finally(() => {
        if (pendingDisarm === wrapped) pendingDisarm = null;
    });
    pendingDisarm = wrapped;
    return wrapped;
}

function syncHistory() {
    if (activeGuard()) void arm();
    else void disarm();
}

/**
 * Leave for good. While the copy is on top, the destination *replaces* it
 * instead of stacking above it: stepping off it first is an asynchronous
 * traversal, and a navigation racing it left the copy behind — one Précédent
 * that seemed to do nothing.
 */
function leaveTo(href: string, options: NavigateOptions | undefined, replace: boolean) {
    const overCopy = armed && window.location.href === homeUrl;
    armed = false;
    release();
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
        if (overCopy || replace) window.location.replace(url.href);
        else window.location.assign(url.href);
        return;
    }
    (overCopy || replace ? originalReplace : originalPush)?.(href, options);
}

/** Capture phase on `window`: runs before Next's own `popstate` listener. */
function onPopState(e: PopStateEvent) {
    if (swallow) {
        const pending = swallow;
        swallow = null;
        if (window.location.href === pending.url) e.stopImmediatePropagation();
        pending.resolve();
        return;
    }
    const wasArmed = armed;
    armed = false;
    // Not armed yet (the copy is pushed right after the first edit): let it go.
    if (!wasArmed || !activeGuard()) return;

    // Keep Next from rendering the destination until the permanent decides.
    e.stopImmediatePropagation();
    const destinationState = e.state;
    void ask().then((leave) => {
        if (!leave) {
            // Back on this page, copy on top again. Also covers a jump of several
            // entries from the history menu, where the address bar has moved.
            pushCopy();
            return;
        }
        release();
        if (window.location.href === homeUrl) window.history.back();
        else window.dispatchEvent(new PopStateEvent('popstate', { state: destinationState }));
    });
}

/**
 * Capture phase on `window`, ahead of React: `preventDefault` here makes
 * next/link skip its navigation (it checks `defaultPrevented`). Clicks the
 * browser would not turn into leaving this page are left alone.
 */
function onClick(e: MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!activeGuard()) return;
    const anchor = (e.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const target = anchor.getAttribute('target');
    if ((target && target !== '_self') || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (samePage(url.href)) return;

    e.preventDefault();
    void ask().then((leave) => {
        if (leave) leaveTo(url.href, undefined, false);
    });
}

function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!activeGuard()) return;
    e.preventDefault();
    e.returnValue = '';
}

/**
 * App Router has no navigation-blocking API, so `push` and `replace` are
 * wrapped on the shared router instance and restored when the last guard
 * leaves. This mutates the router — fragile, and not safe under the React
 * Compiler, but there is no supported alternative.
 */
function guardRouterMethod(original: RouterMethod, replace: boolean): RouterMethod {
    return (href, options) => {
        if (!activeGuard() || samePage(href)) return original(href, options);
        void ask().then((leave) => {
            if (leave) leaveTo(href, options, replace);
        });
    };
}

function install(router: AppRouterInstance) {
    window.addEventListener('popstate', onPopState, { capture: true });
    window.addEventListener('click', onClick, { capture: true });
    window.addEventListener('beforeunload', onBeforeUnload);
    patchedRouter = router;
    originalPush = router.push.bind(router);
    originalReplace = router.replace.bind(router);
    router.push = guardRouterMethod(originalPush, false);
    router.replace = guardRouterMethod(originalReplace, true);
    // A reload while the copy was on top leaves it in the history; adopt it so
    // it is stepped off once nothing is unsaved.
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.[GUARD_KEY]) {
        armed = true;
        homeUrl = window.location.href;
        homeState = { ...state, [GUARD_KEY]: undefined };
    }
}

function uninstall() {
    window.removeEventListener('popstate', onPopState, { capture: true });
    window.removeEventListener('click', onClick, { capture: true });
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (patchedRouter && originalPush && originalReplace) {
        patchedRouter.push = originalPush;
        patchedRouter.replace = originalReplace;
    }
    patchedRouter = originalPush = originalReplace = null;
}

/** Navigate on purpose (after saving, « Annuler »…) without being asked. */
async function navigateUnguarded(href: string, options?: NavigateOptions) {
    // Saving already stepped off the copy; let that traversal land first.
    if (pendingDisarm) await pendingDisarm;
    leaveTo(href, options, false);
}

/**
 * For exits that go through `window.location` rather than the router — sign-out
 * above all. Resolves `true` when nothing is unsaved or the permanent chose to
 * leave; in that case the following page load won't trip `beforeunload`.
 */
export async function confirmLeavingPage(): Promise<boolean> {
    if (!activeGuard()) return true;
    if (!(await ask())) return false;
    // signOut() posts to the server before it sets window.location.
    release(10_000);
    return true;
}

interface WarnIfUnsavedChangesProps {
    unsaved: boolean;
    /** Title, wording and buttons of the dialogue; the defaults speak of unsaved edits. */
    prompt?: Partial<ConfirmOptions>;
}

export const useWarnIfUnsavedChanges = ({ unsaved, prompt }: WarnIfUnsavedChangesProps) => {
    const router = useRouter();
    const confirm = useConfirm();
    const id = useId();

    useEffect(() => {
        confirmFn = confirm;
        if (guards.size === 0) install(router);
        guards.set(id, { active: false, prompt: DEFAULT_PROMPT });
        return () => {
            guards.delete(id);
            if (guards.size === 0) {
                // Still on the page with the copy on top (the editor closed, not
                // navigated away): step off it so Précédent works at once.
                void disarm();
                uninstall();
            } else {
                syncHistory();
            }
        };
    }, [id, router, confirm]);

    const { title, description, confirmLabel, cancelLabel, destructive } = prompt ?? {};
    useEffect(() => {
        guards.set(id, {
            active: unsaved,
            prompt: {
                ...DEFAULT_PROMPT,
                ...(title !== undefined && { title }),
                ...(description !== undefined && { description }),
                ...(confirmLabel !== undefined && { confirmLabel }),
                ...(cancelLabel !== undefined && { cancelLabel }),
                ...(destructive !== undefined && { destructive }),
            },
        });
        syncHistory();
    }, [id, unsaved, title, description, confirmLabel, cancelLabel, destructive]);

    return { navigateWithoutWarning: navigateUnguarded };
};
