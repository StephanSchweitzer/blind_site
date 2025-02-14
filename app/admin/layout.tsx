// app/admin/layout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';

export default function AdminLayout({
                                        children,
                                    }: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-gray-950">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <div className="relative">
                    {children}
                </div>
            </div>
        </div>
    );
}