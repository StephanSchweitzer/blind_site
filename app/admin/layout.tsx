// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { ScrollToTopOnPageChange } from '@/components/admin/ScrollToTopOnPageChange';
import { ReferenceDataProvider } from '@/components/admin/ReferenceDataProvider';
import { getReferenceData } from '@/lib/reference-data';

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
            <BackendNavbar />
            {/* Même cadre que la barre (components/Backend-Navbar.tsx), pour que
                le contenu tombe sous le menu. Le back-office est fait de
                tableaux larges : il prend l'écran jusqu'à 1920 px, au lieu du
                `container` plafonné à 1400 px (et 1280 pour la barre) d'avant. */}
            <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-8 py-4 md:py-8">
                <div className="relative">
                    <ReferenceDataProvider value={referenceData}>
                        {children}
                    </ReferenceDataProvider>
                </div>
            </div>
        </div>
    );
}
