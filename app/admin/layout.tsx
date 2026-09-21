// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { AdminScrollContainer } from '@/components/admin/AdminScrollContainer';

export default function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    return (
        // This wrapper isolates the admin section from root layout's decorative effects
        // (and brings its scroll back to the top on every page change — see the component).
        <AdminScrollContainer>
            <BackendNavbar />
            <div className="container mx-auto px-4 py-4 md:py-8">
                <div className="relative">
                    {children}
                </div>
            </div>
        </AdminScrollContainer>
    );
}
