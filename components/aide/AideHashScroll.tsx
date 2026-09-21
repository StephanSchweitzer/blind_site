'use client';

import { useEffect } from 'react';

/**
 * Amène l'ancre demandée à l'écran, dans /admin/aide.
 *
 * Le défilement natif d'un fragment (`#modification-des-factures`) ne suffit
 * pas ici, même depuis que l'administration défile avec le document. Vérifié :
 * sans ce composant, ouvrir /admin/aide/demandes#modification-des-demandes
 * laisse la page en haut alors que la cible est 9 000 px plus bas, et le
 * permanent ne comprend pas pourquoi son bouton « Aide » l'a envoyé au mauvais
 * endroit. Next diffuse la page par morceaux, cachés dans des `<div hidden>` le
 * temps de l'hydratation : le navigateur résout le fragment trop tôt, ou sur
 * une copie invisible de la cible (voir `SkipLinks`).
 *
 * `scrollIntoView` respecte le `scroll-mt-*` posé sur les titres, qui dégage
 * la barre de navigation.
 */
export function AideHashScroll() {
    useEffect(() => {
        const scrollToHash = () => {
            const id = decodeURIComponent(window.location.hash.replace('#', ''));
            if (!id) return;
            // Le rendu du Markdown précède ce montage, mais un cadre d'attente
            // évite la course avec la mise en page des captures au-dessus.
            requestAnimationFrame(() => {
                // On vise l'élément qui a une boîte : un nœud sans mise en page
                // ne peut pas être amené à l'écran, et `getElementById` rendrait
                // le premier du document sans regarder s'il en a une.
                const candidates = document.querySelectorAll(`[id="${CSS.escape(id)}"]`);
                const target = [...candidates].find(
                    (el) => (el as HTMLElement).getBoundingClientRect().height > 0
                ) ?? candidates[0];
                target?.scrollIntoView({ block: 'start' });
            });
        };

        scrollToHash();
        window.addEventListener('hashchange', scrollToHash);
        return () => window.removeEventListener('hashchange', scrollToHash);
    }, []);

    return null;
}
