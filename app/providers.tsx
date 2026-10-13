'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes';
import React from "react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

type Props = {
    children?: React.ReactNode
}

// No ChakraProvider: it wrapped every page, public ones included, while not a
// single Chakra component was left in the app — its CSS-in-JS runtime and
// global styles shipped for nothing. The UI is Tailwind + Radix
// (components/ui).
//
// refetchOnWindowFocus={false}: by default every return to the tab re-asked
// /api/auth/session — a function invocation each time, on public pages that
// are otherwise served from the cache, and a DB read for anyone signed in. The
// session is still read once per page load; what it decides (menu, sign-in
// link) is cosmetic, the authority is the DB check in proxy.ts and the guards.
export const Providers = ({ children }: Props) => {
    return (
        <SessionProvider refetchOnWindowFocus={false}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ConfirmProvider>{children}</ConfirmProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}
