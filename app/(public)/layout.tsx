import React from 'react';
import { PublicFooter } from '@/components/PublicFooter';

/**
 * Everything outside /admin: the public site and the sign-in screens.
 *
 * The decorative background lives here, not in the root layout, so the back
 * office never renders it. It used to be drawn on every page and hidden under
 * the admin by an opaque fixed layer that also had to scroll by itself, which
 * broke Next's scroll reset between pages (see app/admin/layout.tsx).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* Animated gradient background overlay - more visible in light mode */}
            <div className="fixed inset-0 overflow-hidden opacity-30 dark:opacity-30 pointer-events-none transition-opacity duration-300">
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

            {children}

            <PublicFooter />
        </>
    );
}
