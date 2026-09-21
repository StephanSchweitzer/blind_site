'use client';

import { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Les onglets d'un même dossier : /admin/users/dossier/<id>/<onglet>.
const DOSSIER = /^\/admin\/users\/dossier\/(\d+)(?:\/|$)/;

const sameDossier = (a: string, b: string) => {
    const idA = DOSSIER.exec(a)?.[1];
    return idA !== undefined && idA === DOSSIER.exec(b)?.[1];
};

/**
 * Chaque nouvelle page de l'administration s'ouvre en haut.
 *
 * Next ne remonte en haut que si le haut de la nouvelle page est hors de
 * l'écran : c'est pensé pour les onglets, où l'en-tête reste en place et seul
 * le contenu change. Mais il ne sait pas distinguer un onglet d'une autre page,
 * et il mesure depuis le haut de la fenêtre sans voir la barre de navigation
 * collante. Défilé de moins de ~96 px, on arrivait donc sur la page suivante
 * avec le même décalage, le titre parfois caché sous la barre.
 *
 * La règle, explicite :
 * - un changement de chemin remonte en haut ;
 * - sauf entre onglets d'un même dossier, où l'on garde le comportement de
 *   Next (l'en-tête du dossier ne bouge pas, seul l'onglet change) ;
 * - sauf avec une ancre (`#…`), laissée à la page (voir `AideHashScroll`) ;
 * - sauf avec Précédent / Suivant : le navigateur ramène à la position quittée ;
 * - les paramètres de recherche seuls (filtres, pagination) ne comptent pas :
 *   la liste ne doit pas sauter pendant qu'on filtre.
 *
 * Layout effect : il passe après la tentative de Next (les effets d'un parent
 * suivent ceux de ses enfants), et avant que la page ne soit peinte.
 */
export function ScrollToTopOnPageChange() {
    const pathname = usePathname();
    const previous = useRef(pathname);
    const traversedTo = useRef<string | null>(null);

    // `popstate` part avant que le routeur ne rende la page, l'URL déjà à jour.
    // On retient le chemin visé, pas un simple drapeau : un retour qui ne change
    // que les paramètres ne déclenche pas l'effet, et un drapeau resté levé
    // avalerait la navigation suivante.
    useLayoutEffect(() => {
        const onPopState = () => { traversedTo.current = window.location.pathname; };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useLayoutEffect(() => {
        const from = previous.current;
        const wasTraversal = traversedTo.current === pathname;
        previous.current = pathname;
        traversedTo.current = null;
        if (wasTraversal || from === pathname || sameDossier(from, pathname)) return;
        if (window.location.hash) return;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname]);

    return null;
}
