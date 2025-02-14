'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const BackendNavbar = () => {
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const handleStart = () => setIsLoading(true);
        const handleComplete = () => setIsLoading(false);

        window.addEventListener('beforeunload', handleStart);
        window.addEventListener('load', handleComplete);

        return () => {
            window.removeEventListener('beforeunload', handleStart);
            window.removeEventListener('load', handleComplete);
        };
    }, []);

    return (
        <nav className="relative bg-gray-800 p-4 text-white">
            <div className="flex items-center space-x-8">
                <Link
                    href="/admin"
                    className="font-bold hover:text-gray-300 transition-colors"
                >
                    Administration
                </Link>
                <Link
                    href="/admin/books"
                    className="hover:text-gray-300 transition-colors"
                >
                    Catalogue
                </Link>
                <Link
                    href="/admin/genres"
                    className="hover:text-gray-300 transition-colors"
                >
                    Genres
                </Link>
                <Link
                    href="/admin/news"
                    className="hover:text-gray-300 transition-colors"
                >
                    Dernières infos
                </Link>
                <Link
                    href="/admin/manage_coups_de_coeur"
                    className="hover:text-gray-300 transition-colors"
                >
                    Coups de Coeur
                </Link>
                <Link
                    href="/"
                    className="hover:text-gray-300 transition-colors"
                >
                    Site principal
                </Link>
            </div>

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                    <Loader2 className="animate-spin h-6 w-6 text-white" />
                </div>
            )}
        </nav>
    );
};

export default BackendNavbar;