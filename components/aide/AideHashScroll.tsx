'use client';

import { useEffect } from 'react';

/**
 * Amène l'ancre demandée à l'écran, dans /admin/aide.
 *
 * Le défilement natif d'un fragment (`#modification-des-factures`) suppose que
 * la page défile avec le document. Ici elle ne le fait pas : `app/admin/layout.tsx`
 * enferme tout l'espace d'administration dans un `fixed inset-0 overflow-y-auto`,
 * et le conteneur qui défile n'est donc pas le document. Le navigateur laisse
 * `scrollTop` à 0 et le permanent atterrit en haut de la section, sans comprendre
 * pourquoi son bouton « Aide » l'a envoyé au mauvais endroit.
 *
 * `scrollIntoView`, lui, remonte jusqu'au parent défilant — et respecte le
 * `scroll-mt-*` posé sur les titres, qui dégage la barre de navigation.
 *
 * Vérifié en conditions réelles : sans ce composant, ouvrir
 * /admin/aide/demandes#modification-des-demandes laisse le conteneur à
 * scrollTop 0 alors que la cible est à 3347 px plus bas.
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
