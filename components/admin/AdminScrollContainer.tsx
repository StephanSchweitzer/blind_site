'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Le conteneur qui défile dans tout l'espace d'administration — et qui remonte
 * en haut à chaque changement de page.
 *
 * L'administration n'utilise pas le défilement du document : tout est enfermé
 * dans un `fixed inset-0 overflow-y-auto` (isolé des effets décoratifs du
 * layout racine). Ce conteneur appartient au layout, qui survit aux navigations,
 * donc son `scrollTop` passe tel quel d'une page à l'autre.
 *
 * Le routeur de Next ne le corrige pas : il ne remet à zéro que
 * `document.documentElement`, qui ici ne défile pas, et sinon se contente
 * d'amener le haut de la nouvelle page « dans la vue » — sans rien faire s'il y
 * est déjà (on arrive alors légèrement plus bas), ou en l'alignant sous la barre
 * de navigation collante (on arrive nettement plus bas, titre masqué).
 *
 * On remet donc le conteneur à 0 à chaque changement de chemin. Seul le chemin
 * compte : un filtre ou une pagination qui ne touche qu'aux paramètres de
 * recherche ne doit pas faire sauter la liste. Une ancre (`#…`) est laissée à
 * `AideHashScroll`, qui amène lui-même la section demandée à l'écran.
 */
export function AdminScrollContainer({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    // Layout effect : la remise à zéro a lieu avant que la nouvelle page soit
    // peinte, sans saut visible, et après la tentative de défilement de Next.
    useLayoutEffect(() => {
        if (window.location.hash) return;
        ref.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [pathname]);

    return (
        <div ref={ref} className="fixed inset-0 bg-background z-10 overflow-y-auto overflow-x-hidden">
            {children}
        </div>
    );
}
