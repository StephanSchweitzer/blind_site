import React from 'react';
import { PublicFooter } from '@/components/PublicFooter';

/**
 * Everything outside /admin: the public site and the sign-in screens.
 *
 * No decorative background any more: the three blurred colour blobs that
 * drifted behind every page, and the fading vignette at its edges, were motion
 * nobody asked for on a site read at high zoom, and a steady load on older
 * computers. The page background is the plain `--background` (app/globals.css).
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {children}

            <PublicFooter />
        </>
    );
}
