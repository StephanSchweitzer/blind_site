// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';

export default function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    return (
        // This wrapper isolates the admin section from root layout's decorative effects
        <div className="fixed inset-0 bg-gray-950 z-10 overflow-auto">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <div className="relative">
                    {children}
                </div>
            </div>
        </div>
    );
}