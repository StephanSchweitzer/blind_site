'use client';

import { useEffect, useRef } from 'react';
import { signIn } from 'next-auth/react';

// Passwordless sign-in as the local dev account, through the "dev-claude"
// provider in lib/auth.ts. That provider exists only in development, with
// DEV_AUTH_BYPASS=true and a local database; without it NextAuth lands on the
// sign-in page instead.
export default function DevSignInPage() {
    // Strict mode runs effects twice in development: one sign-in is enough.
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void signIn('dev-claude', { callbackUrl: '/admin' });
    }, []);

    return (
        <main className="min-h-screen flex items-center justify-center px-4">
            <p role="status" className="text-foreground">
                Connexion dev…
            </p>
        </main>
    );
}
