// components/ui/admin/AdminLayout.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';

export function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gray-950">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <div className="relative">
                    {/* Admin area gradient markers */}
                    <div className="hidden lg:block fixed inset-y-0 w-full">
                        <div className="h-full max-w-6xl mx-auto">
                            <div className="h-full flex">
                                <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-900/50"></div>
                                <div className="flex-1"></div>
                                <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-900/50"></div>
                            </div>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}