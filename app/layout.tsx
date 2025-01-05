import './globals.css'
import { Providers } from './providers'
import React from "react";

export const metadata = {
    title: 'ECA Aveugles',
    description: 'ECA: Enregistrements à la Carte pour les Aveugles'
}

export default function RootLayout({
                                       children
                                   }: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
        <body>
        <Providers>{children}</Providers>
        </body>
        </html>
    )
}
