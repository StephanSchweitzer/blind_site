'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, type ComponentProps } from 'react';

/**
 * Un lien de l'administration qui précharge sa page au survol, pas avant.
 *
 * Le préchargement par défaut de Next part dès qu'un lien est à l'écran : sur
 * une page /admin dynamique, c'est un passage par proxy.ts (avec sa lecture en
 * base) par lien visible, et Vercel comptait plus d'appels venus du tableau de
 * bord et du menu que de clics. D'où `prefetch={false}` partout — mais alors le
 * clic attend la réponse du serveur sans rien montrer.
 *
 * Ici, l'intention seulement : la souris qui s'arrête sur le lien (80 ms, pour
 * ignorer celle qui ne fait que passer en travers du menu), ou le doigt qui se
 * pose. Un appel par lien visé, à peu près autant que de clics. Next ne
 * charge alors que le haut de la page jusqu'à son écran d'attente
 * (`loading.tsx`) : au clic, celui-ci s'affiche aussitôt, et le reste arrive
 * derrière.
 *
 * Pas au focus clavier : parcourir le menu à la touche Tab passerait par
 * chaque lien. Le clavier garde la barre de chargement
 * (components/NavigationFeedback.tsx).
 */

/** La souris doit s'arrêter ce temps-là sur le lien. */
const HOVER_INTENT_MS = 80;

type IntentLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>;

export function IntentLink({ href, target, onMouseEnter, onMouseLeave, onTouchStart, ...props }: IntentLinkProps) {
    const router = useRouter();
    const hoverTimer = useRef<number | undefined>(undefined);

    // Un nouvel onglet ne profiterait pas du cache de celui-ci.
    const prefetch = () => {
        if (typeof href === 'string' && (!target || target === '_self')) router.prefetch(href);
    };

    return (
        <Link
            {...props}
            href={href}
            target={target}
            prefetch={false}
            onMouseEnter={(e) => {
                onMouseEnter?.(e);
                window.clearTimeout(hoverTimer.current);
                hoverTimer.current = window.setTimeout(prefetch, HOVER_INTENT_MS);
            }}
            onMouseLeave={(e) => {
                onMouseLeave?.(e);
                window.clearTimeout(hoverTimer.current);
            }}
            onTouchStart={(e) => {
                onTouchStart?.(e);
                prefetch();
            }}
        />
    );
}
