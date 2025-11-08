'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface NewsSearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    placeholder?: string;
}

export function SearchBar({
                              searchTerm,
                              onSearchChange,
                              placeholder = "Rechercher dans les actualités..."
                          }: NewsSearchBarProps) {
    return (
        <div className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-4 py-2 pl-10 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg
                             text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                             transition-all duration-300"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
            </div>
        </div>
    );
}