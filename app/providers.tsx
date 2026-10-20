'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ThemeProvider } from 'next-themes';
import React, { useEffect, useState } from "react";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { clearSessionHint, hasSessionHint, setSessionHint } from '@/lib/auth/session-hint';

type Props = {
    children?: React.ReactNode
}

/**
 * The session SessionProvider starts from. `undefined` makes it ask
 * /api/auth/session on mount; `null` means « signed out » and asks nothing.
 *
 * `null` only for a browser that has never signed in (lib/auth/session-hint.ts)
 * and only outside /admin and /auth, whose pages need the real answer and see
 * few visitors. On the server, `undefined` as before: the public pages are
 * prerendered for everyone, and the state is not markup — the navbar renders
 * the same for « loading » and « signed out ». Signing in still loads the
 * session: next-auth's signIn() forces a read whatever the provider started from.
 */
function initialSession(): null | undefined {
    if (typeof window === 'undefined') return undefined;
    const path = window.location.pathname;
    if (path.startsWith('/admin') || path.startsWith('/auth') || path === '/profile') return undefined;
    return hasSessionHint() ? undefined : null;
}

/**
 * Keeps the hint in step with what the session read answered: renewed while
 * someone is signed in, so it rolls with the JWT instead of lapsing 30 days
 * after the last /admin visit; dropped once the session has expired or been
 * signed out, after costing one read.
 */
function SyncSessionHint() {
    const { status } = useSession();
    useEffect(() => {
        if (status === 'authenticated') setSessionHint();
        else if (status === 'unauthenticated') clearSessionHint();
    }, [status]);
    return null;
}

// No ChakraProvider: it wrapped every page, public ones included, while not a
// single Chakra component was left in the app — its CSS-in-JS runtime and
// global styles shipped for nothing. The UI is Tailwind + Radix
// (components/ui).
//
// refetchOnWindowFocus={false}: by default every return to the tab re-asked
// /api/auth/session — a function invocation each time, on public pages that
// are otherwise served from the cache, and a DB read for anyone signed in. What
// the session decides on the public site (menu, sign-in link) is cosmetic, the
// authority is the DB check in proxy.ts and the guards.
export const Providers = ({ children }: Props) => {
    const [session] = useState(initialSession);
    return (
        <SessionProvider session={session} refetchOnWindowFocus={false}>
            <SyncSessionHint />
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ConfirmProvider>{children}</ConfirmProvider>
            </ThemeProvider>
        </SessionProvider>
    );
}
