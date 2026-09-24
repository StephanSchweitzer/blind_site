'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes';
import React from "react";

type Props = {
    children?: React.ReactNode
}

// No ChakraProvider: it wrapped every page, public ones included, while not a
// single Chakra component was left in the app — its CSS-in-JS runtime and
// global styles shipped for nothing. The UI is Tailwind + Radix
// (components/ui).
export const Providers = ({ children }: Props) => {
    return (
        <SessionProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                {children}
            </ThemeProvider>
        </SessionProvider>
    );
}
