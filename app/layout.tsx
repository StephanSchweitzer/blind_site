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
        <html lang="fr" suppressHydrationWarning>
        <body className="bg-slate-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 dark:bg-gradient-to-br text-gray-900 dark:text-gray-100 transition-colors duration-300">
        {/* Animated gradient background overlay - more visible in light mode */}
        <div className="fixed inset-0 opacity-30 dark:opacity-30 pointer-events-none transition-opacity duration-300">
            <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 dark:bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-blob"></div>
            <div className="absolute top-0 -right-4 w-72 h-72 bg-indigo-400 dark:bg-blue-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-400 dark:bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000"></div>
        </div>

        {/* Subtle vignette edges */}
        <div className="hidden lg:block fixed inset-y-0 w-full pointer-events-none">
            <div className="h-full max-w-6xl mx-auto">
                <div className="h-full flex">
                    <div className="w-32 h-full bg-gradient-to-r from-slate-50/80 dark:from-gray-900/50 to-transparent"></div>
                    <div className="flex-1"></div>
                    <div className="w-32 h-full bg-gradient-to-l from-slate-50/80 dark:from-gray-900/50 to-transparent"></div>
                </div>
            </div>
        </div>

        <Toaster />
        <Providers>{children}</Providers>
        </body>
        </html>
    )
}