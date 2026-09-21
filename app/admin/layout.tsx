// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';

export default function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    return (
        // This wrapper covers the root layout's decorative effects with an opaque,
        // full-height background. The document itself scrolls — never make this a
        // scroll container (fixed + overflow-auto): Next.js only resets the
        // document's scroll on navigation, so pages would open scrolled down, and
        // back/forward, anchors and mobile scroll gestures all break.
        // overflow-x-clip, not -hidden: -hidden turns it back into a scroll container.
        <div className="relative z-10 min-h-dvh bg-background overflow-x-clip">
            <BackendNavbar />
            <div className="container mx-auto px-4 py-4 md:py-8">
                <div className="relative">
                    {children}
                </div>
            </div>
        </div>
    );
}