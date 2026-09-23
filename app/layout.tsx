import './globals.css'
import { Providers } from './providers'
import React from "react";
import { Toaster } from "@/components/ui/toaster"
import type { Metadata } from "next";
import { AFFICHAGE_INIT_SCRIPT } from '@/lib/affichage';

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
        <html lang="fr" suppressHydrationWarning>
        <head>
            {/* Réglages d'affichage (lib/affichage.ts) posés avant le premier
                rendu : sinon la page s'affiche en petit, puis saute. */}
            <script dangerouslySetInnerHTML={{ __html: AFFICHAGE_INIT_SCRIPT }} />
        </head>
        <body className="bg-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 dark:bg-gradient-to-br text-gray-900 dark:text-gray-100 transition-colors duration-300">
        <Toaster />
        <Providers>{children}</Providers>
        </body>
        </html>
    )
}