// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { ScrollToTopOnPageChange } from '@/components/admin/ScrollToTopOnPageChange';
import { SkipLinks } from '@/components/SkipLinks';
import { ReferenceDataProvider } from '@/components/admin/ReferenceDataProvider';
import { getReferenceData } from '@/lib/reference-data';
import type { Metadata } from 'next';

// Chaque page du back-office donne son nom à l'onglet (« Demandes — Arbre Rose »).
// Avant, tous les onglets s'appelaient comme l'accueil du site public : avec
// Demandes, Attributions et une fiche ouvertes côte à côte, impossible de
// retrouver le bon. `absolute` : le modèle « … | ECA Aveugles » du site public
// (app/layout.tsx) ne s'applique pas ici.
export const metadata: Metadata = {
    title: { absolute: 'Arbre Rose', template: '%s — Arbre Rose' },
};

export default async function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    const referenceData = await getReferenceData();

    return (
        // The document itself scrolls — never make this a scroll container
        // (fixed + overflow-auto): Next.js only resets the document's scroll on
        // navigation, so pages would open scrolled down, and back/forward, anchors
        // and mobile scroll gestures all break.
        // overflow-x-clip, not -hidden: -hidden turns it back into a scroll container.
        <div className="min-h-dvh bg-background overflow-x-clip">
            <ScrollToTopOnPageChange />
            {/* Les mêmes liens d'évitement que le site public : sans <main>, un
                lecteur d'écran n'avait aucun repère pour sauter le menu. */}
            <SkipLinks navId="navigation-back-office" />
            <BackendNavbar />
            {/* Même cadre que la barre (components/Backend-Navbar.tsx), pour que
                le contenu tombe sous le menu. Le back-office est fait de
                tableaux larges : il prend l'écran jusqu'à 1920 px, au lieu du
                `container` plafonné à 1400 px (et 1280 pour la barre) d'avant. */}
            <main id="contenu-principal" className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8 py-4 md:py-8 focus:outline-none">
                <div className="relative">
                    <ReferenceDataProvider value={referenceData}>
                        {children}
                    </ReferenceDataProvider>
                </div>
            </main>
        </div>
    );
}
