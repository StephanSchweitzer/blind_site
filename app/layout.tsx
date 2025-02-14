import './globals.css'
import { Providers } from './providers'
import React from "react";
import { Toaster } from "@/components/ui/toaster"

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
        <Toaster />
        <Providers>{children}</Providers>
        </body>
        </html>
    )
}
