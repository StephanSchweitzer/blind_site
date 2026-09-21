import type { Metadata } from 'next';
import React from 'react';

// The page itself is a client component, so it cannot export metadata. Without
// this the tab and window title fell back to the site default and every auth
// screen announced the same title, which tells a screen-reader user nothing
// about where they landed (RGAA 8.5).
export const metadata: Metadata = {
    title: 'Connexion',
    robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return children;
}
