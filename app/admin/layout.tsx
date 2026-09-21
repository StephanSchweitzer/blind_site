// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { ScrollToTopOnPageChange } from '@/components/admin/ScrollToTopOnPageChange';

export default function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    return (
        // The document itself scrolls — never make this a scroll container
        // (fixed + overflow-auto): Next.js only resets the document's scroll on
        // navigation, so pages would open scrolled down, and back/forward, anchors
        // and mobile scroll gestures all break.
        // overflow-x-clip, not -hidden: -hidden turns it back into a scroll container.
        <div className="min-h-dvh bg-background overflow-x-clip">
            <ScrollToTopOnPageChange />
            <BackendNavbar />
            <div className="container mx-auto px-4 py-4 md:py-8">
                <div className="relative">
                    {children}
                </div>
            </div>
        </div>
    );
}
