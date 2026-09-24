'use client';

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * L'état d'une liste publique (catalogue, dernières infos) tenu dans l'URL :
 * recharger la page, revenir par « Précédent » ou partager le lien retombe sur
 * la même recherche, à la même page.
 *
 * Pourquoi pas `useSearchParams` : ces pages sont servies en statique depuis
 * le cache. Le lire ferait basculer la liste en rendu client — le HTML servi
 * montrerait « Chargement… » au lieu des livres. L'URL se lit donc dans le
 * navigateur, après l'hydratation (instantané serveur vide), et se relit à
 * chaque `popstate` (Précédent / Suivant du navigateur).
 *
 * - `apply` reçoit l'URL chaque fois qu'elle change **de l'extérieur** : au
 *   chargement, et à chaque retour arrière. Appelé pendant le rendu (l'état
 *   s'ajuste sans effet — react-hooks/set-state-in-effect), il doit remettre
 *   à leur valeur par défaut les paramètres absents.
 * - `write` pose la requête de la liste dans l'URL. Un changement de page seul
 *   ajoute une entrée d'historique — « Précédent » ramène à la page d'avant ;
 *   tout le reste (une lettre tapée, un filtre) remplace l'entrée courante,
 *   sans quoi « Précédent » défairait la recherche lettre par lettre.
 *   `replace` force le remplacement : une page corrigée (au-delà de la fin)
 *   ne doit pas laisser derrière elle une entrée qui y ramènerait.
 *
 * `write` s'appelle hors du rendu et hors du corps d'un effet : dans un
 * gestionnaire, un minuteur ou après un `await`. Il ne touche jamais une URL
 * qu'`apply` n'a pas encore reçue : au chargement, la recherche par défaut
 * lancée au montage peut partir avant que l'URL ne soit lue, et l'aurait
 * effacée ; après un retour arrière, une recherche encore en attente aurait
 * écrasé la page retrouvée.
 */

function subscribe(onChange: () => void) {
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
}

const readSearch = () => window.location.search;
const serverSearch = () => '';

/** La requête sans `page` : ce qui distingue une nouvelle recherche d'un simple changement de page. */
function withoutPage(search: string): string {
    const params = new URLSearchParams(search);
    params.delete('page');
    params.sort();
    return params.toString();
}

export function useListUrl(apply: (params: URLSearchParams) => void) {
    const search = useSyncExternalStore(subscribe, readSearch, serverSearch);
    // La dernière URL vue — posée par `write` ou appliquée ici. Une URL
    // différente vient donc d'ailleurs : chargement ou retour arrière.
    const [seen, setSeen] = useState('');
    if (search !== seen) {
        setSeen(search);
        apply(new URLSearchParams(search));
    }
    // Ce que `write` compare à l'URL réelle — posé après le rendu validé.
    const applied = useRef('');
    useLayoutEffect(() => {
        applied.current = seen;
    }, [seen]);

    return useCallback((params: URLSearchParams, { replace = false }: { replace?: boolean } = {}) => {
        const qs = params.toString();
        const next = qs ? `?${qs}` : '';
        const current = window.location.search;
        if (current !== applied.current || next === current) return;
        const url = next || window.location.pathname;
        // `null` : Next (≥ 14.1) complète l'état d'historique et tient son
        // routeur au courant de l'URL.
        if (!replace && withoutPage(next) === withoutPage(current)) {
            window.history.pushState(null, '', url);
        } else {
            window.history.replaceState(null, '', url);
        }
        applied.current = window.location.search;
        setSeen(window.location.search);
    }, []);
}
