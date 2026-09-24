import React from 'react';
import { PublicFooter } from '@/components/PublicFooter';

/**
 * Everything outside /admin: the public site and the sign-in screens.
 *
 * The decorative background lives here, not in the root layout, so the back
 * office never renders it. It used to be drawn on every page and hidden under
 * the admin by an opaque fixed layer that also had to scroll by itself, which
 * broke Next's scroll reset between pages (see app/admin/layout.tsx).
 *
 * Three soft colour glows behind the frosted-glass cards — the blues of the
 * logo and one of its violet spines. They used to drift in a loop (7 s,
 * forever); they now stay put: the look is kept, the constant motion is not.
 * « Contraste renforcé » hides them (`.decor-fond`, app/globals.css), and so
 * does a phone: at 375 px one glow sat right behind the page title and the
 * phone numbers, and pulled their contrast under 4.5:1 in dark mode.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <div aria-hidden="true" className="decor-fond hidden md:block fixed inset-0 -z-10 overflow-hidden pointer-events-none opacity-40 dark:opacity-45">
                <div className="absolute -top-16 -left-16 w-80 h-80 bg-sky-300 dark:bg-blue-600 rounded-full blur-3xl" />
                <div className="absolute top-1/3 -right-20 w-96 h-96 bg-blue-300 dark:bg-indigo-600 rounded-full blur-3xl" />
                <div className="absolute -bottom-24 left-1/4 w-80 h-80 bg-violet-300 dark:bg-violet-700 rounded-full blur-3xl" />
            </div>

            {children}

            <PublicFooter />
        </>
    );
}
