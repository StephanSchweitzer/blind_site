'use client';

import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import FrontendNavbar from '@/components/Frontend-Navbar';

/**
 * Attente entre deux pages du site public (app/(public)/loading.tsx).
 *
 * Le menu reste en place : l'ancien écran le retirait avec toute la page, et
 * les réglages d'affichage (taille du texte, contraste renforcé — posés sur
 * `:root:has(#navigation-principale)`, app/globals.css) sautaient avec lui le
 * temps du chargement. Fond vide, barre qui défile en haut et cercle au milieu
 * de l'écran : un flash d'un quart de seconde avant chaque page.
 *
 * Rien ne s'affiche d'abord : l'indicateur n'apparaît qu'au-delà d'une demi-
 * seconde (`.chargement-differe`), quand l'attente se remarque vraiment.
 *
 * Les écrans de connexion (/auth/*) n'ont pas de menu : l'attente non plus.
 * Le chemin est déjà celui de la page demandée quand ce repli s'affiche.
 */
export function PublicLoading() {
    const pathname = usePathname();
    const navbar = !pathname?.startsWith('/auth/');

    return (
        <div className="flex min-h-screen flex-col">
            {navbar && <FrontendNavbar />}
            <main id="contenu-principal" className="relative flex-1">
                <div className="chargement-differe flex items-center justify-center gap-3 py-24 text-muted-foreground">
                    <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin [animation-duration:1.6s]" />
                    <p className="text-base">Chargement…</p>
                </div>
            </main>
        </div>
    );
}
