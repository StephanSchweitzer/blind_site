import './globals.css'
import { Providers } from './providers'
import React from "react";
import { Toaster } from "@/components/ui/toaster"
import type { Metadata } from "next";
import { AFFICHAGE_INIT_SCRIPT } from '@/lib/affichage';
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from 'next/font/google';

// Atkinson Hyperlegible : dessinée par le Braille Institute pour les lecteurs
// malvoyants — chaque lettre se distingue de ses voisines (I l 1, O 0, b d).
// La Mono sert aux numéros, ISBN et montants du back-office. Servies depuis le
// site lui-même (next/font), sans appel à Google chez le visiteur.
const atkinson = Atkinson_Hyperlegible_Next({
    subsets: ['latin', 'latin-ext'],
    display: 'swap',
    // Next has no fallback metrics for these recent faces yet (it warns at build).
    adjustFontFallback: false,
    variable: '--font-sans',
});
const atkinsonMono = Atkinson_Hyperlegible_Mono({
    subsets: ['latin', 'latin-ext'],
    display: 'swap',
    // Next has no fallback metrics for these recent faces yet (it warns at build).
    adjustFontFallback: false,
    variable: '--font-mono',
});

const siteUrl = 'https://eca-aveugles.fr';
const description = "Les ECA (Enregistrements à la Carte pour les Aveugles) proposent aux personnes aveugles et malvoyantes un service gratuit d'enregistrement de livres et documents sur mesure, lus par des bénévoles.";

export const metadata: Metadata = {
    metadataBase: new URL(siteUrl),
    title: {
        default: 'ECA - Enregistrements à la Carte pour les Aveugles',
        template: '%s | ECA Aveugles',
    },
    description,
    openGraph: {
        type: 'website',
        locale: 'fr_FR',
        siteName: 'ECA Aveugles',
        title: 'ECA - Enregistrements à la Carte pour les Aveugles',
        description,
        url: siteUrl,
        images: [{ url: '/eca_logo.png', width: 1024, height: 168, alt: 'ECA - Enregistrements à la Carte pour les Aveugles' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'ECA - Enregistrements à la Carte pour les Aveugles',
        description,
        images: ['/eca_logo.png'],
    },
}

export default function RootLayout({
                                       children
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="fr" suppressHydrationWarning className={`${atkinson.variable} ${atkinsonMono.variable}`}>
        <head>
            {/* Réglages d'affichage (lib/affichage.ts) posés avant le premier
                rendu : sinon la page s'affiche en petit, puis saute. */}
            <script dangerouslySetInnerHTML={{ __html: AFFICHAGE_INIT_SCRIPT }} />
        </head>
        <body className="bg-background font-sans text-foreground antialiased">
        <Toaster />
        <Providers>{children}</Providers>
        </body>
        </html>
    )
}