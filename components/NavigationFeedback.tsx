'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Réponse immédiate à chaque clic de navigation, sur tout le site.
 *
 * Entre un clic et l'arrivée de la page, il ne se passait rien : les liens de
 * l'administration ne préchargent pas (components/admin/IntentLink.tsx), si
 * bien que l'écran d'attente (`loading.tsx`) n'apparaît qu'une fois la réponse
 * du serveur arrivée — proxy.ts, sa lecture en base, puis le rendu. Sur une
 * fonction Vercel froide, une seconde pleine d'écran figé, qui fait recliquer.
 *
 * Deux signes, posés dès le clic et retirés quand l'URL a changé :
 * - le lien cliqué s'estompe et le curseur passe en « attente » —
 *   `data-navigation-en-cours` sur le lien et sur `<html>` (app/globals.css) ;
 * - une fine barre en haut de la fenêtre, après 100 ms seulement : une page
 *   déjà préchargée (presque tout le site public) arrive avant, et la barre ne
 *   clignote pas pour rien.
 *
 * Écoute globale plutôt qu'un crochet dans chaque <Link> : elle couvre aussi
 * les simples <a> et tous les liens à venir. Elle ne voit pas les navigations
 * lancées par code (router.push depuis une ligne de tableau, une recherche) :
 * celles-là appellent `announceNavigation`.
 *
 * L'URL change quand Next affiche la nouvelle page OU son écran d'attente :
 * la barre s'arrête là, et l'écran d'attente prend le relais.
 */

/** Sous ce délai, la page arrive sans qu'on voie la barre. */
const SHOW_AFTER_MS = 100;
/**
 * Garde-fou : une navigation qui n'aboutit jamais (réseau coupé, lien dont le
 * clic est intercepté sans navigation) ne laisse pas la barre affichée.
 */
const GIVE_UP_AFTER_MS = 10_000;
/** Le temps de finir la barre puis de l'effacer (voir app/globals.css). */
const FADE_OUT_MS = 500;

const PENDING = 'data-navigation-en-cours';

type Controller = {
    start: (anchor: HTMLAnchorElement | null) => void;
    finish: () => void;
    dispose: () => void;
};

/** L'instance montée par le layout racine, pour `announceNavigation`. */
let active: Controller | null = null;

/** Même page, ou seulement une ancre (`#…`) : pas de navigation à attendre. */
function isSamePage(url: URL): boolean {
    return url.pathname === window.location.pathname && url.search === window.location.search;
}

/**
 * Pour une navigation lancée par code : à appeler juste avant `router.push`.
 * Ne fait rien pour la page courante, dont l'URL ne changera pas.
 */
export function announceNavigation(href: string): void {
    if (!active) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || isSamePage(url)) return;
    active.start(null);
}

/** Le lien d'un clic qui va charger une autre page de ce site, sinon null. */
function navigationAnchor(event: MouseEvent): HTMLAnchorElement | null {
    // Ctrl/Cmd/Maj+clic ouvrent un onglet ou une fenêtre : cette page ne change pas.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (!(event.target instanceof Element)) return null;
    const anchor = event.target.closest('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return null;
    if (anchor.target && anchor.target !== '_self') return null;
    if (anchor.hasAttribute('download')) return null;
    const url = new URL(anchor.href);
    // mailto:, tel: et les autres sites ont une autre origine. Une route /api
    // rend un fichier, pas une page : l'URL ne changerait jamais.
    if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return null;
    if (isSamePage(url)) return null;
    return anchor;
}

function createController(bar: HTMLElement): Controller {
    const root = document.documentElement;
    let anchor: HTMLAnchorElement | null = null;
    let showTimer: number | undefined;
    let giveUpTimer: number | undefined;
    let hideTimer: number | undefined;

    const clearTimers = () => {
        window.clearTimeout(showTimer);
        window.clearTimeout(giveUpTimer);
        window.clearTimeout(hideTimer);
    };

    const finish = () => {
        if (!root.hasAttribute(PENDING)) return;
        clearTimers();
        anchor?.removeAttribute(PENDING);
        anchor = null;
        root.removeAttribute(PENDING);
        if (bar.dataset.etat !== 'en-cours') {
            delete bar.dataset.etat;
            return;
        }
        bar.dataset.etat = 'terminee';
        hideTimer = window.setTimeout(() => { delete bar.dataset.etat; }, FADE_OUT_MS);
    };

    const start = (next: HTMLAnchorElement | null) => {
        clearTimers();
        anchor?.removeAttribute(PENDING);
        anchor = next;
        anchor?.setAttribute(PENDING, '');
        root.setAttribute(PENDING, '');
        // Un clic pendant l'effacement de la précédente : la barre repart de
        // zéro au lieu de reculer depuis la fin.
        if (bar.dataset.etat === 'terminee') {
            delete bar.dataset.etat;
            void bar.offsetWidth;
        }
        if (bar.dataset.etat !== 'en-cours') {
            showTimer = window.setTimeout(() => { bar.dataset.etat = 'en-cours'; }, SHOW_AFTER_MS);
        }
        giveUpTimer = window.setTimeout(finish, GIVE_UP_AFTER_MS);
    };

    const onClick = (event: MouseEvent) => {
        const target = navigationAnchor(event);
        if (target) start(target);
    };
    // Retour sur une page gardée en mémoire par le navigateur (bfcache) après
    // un lien ordinaire : elle revient telle qu'on l'a quittée, barre comprise.
    const onPageShow = (event: PageTransitionEvent) => {
        if (event.persisted) finish();
    };

    // En capture : avant qu'un gestionnaire du lien n'arrête l'événement.
    document.addEventListener('click', onClick, true);
    window.addEventListener('pageshow', onPageShow);

    return {
        start,
        finish,
        dispose: () => {
            document.removeEventListener('click', onClick, true);
            window.removeEventListener('pageshow', onPageShow);
            clearTimers();
            anchor?.removeAttribute(PENDING);
            root.removeAttribute(PENDING);
        },
    };
}

export function NavigationFeedback() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const barRef = useRef<HTMLDivElement>(null);
    const controllerRef = useRef<Controller | null>(null);

    useEffect(() => {
        if (!barRef.current) return;
        const controller = createController(barRef.current);
        controllerRef.current = controller;
        active = controller;
        return () => {
            controller.dispose();
            if (active === controller) active = null;
            controllerRef.current = null;
        };
    }, []);

    // La nouvelle URL est en place : la page, ou son écran d'attente, est affichée.
    useEffect(() => {
        controllerRef.current?.finish();
    }, [pathname, searchParams]);

    return <div ref={barRef} aria-hidden="true" className="barre-navigation" />;
}
