'use client';

import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

interface NewsSearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    placeholder?: string;
    label?: string;
}

export function SearchBar({
                              searchTerm,
                              onSearchChange,
                              placeholder = "Rechercher dans les actualités...",
                              label = "Rechercher dans les actualités"
                          }: NewsSearchBarProps) {
    const inputId = useId();

    return (
        <search role="search" className="relative w-full group">
            <div className="relative">
                {/* The field previously had a placeholder only, so it was announced
                    as an unlabelled edit box once the user started typing
                    (RGAA 11.1). */}
                <label htmlFor={inputId} className="sr-only">{label}</label>
                <input
                    id={inputId}
                    type="search"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-4 py-3 pl-11 pr-11
                        bg-white/95 dark:bg-gray-700/95
                        backdrop-blur-xl
                        border-2 border-gray-300/50 dark:border-gray-600/50
                        rounded-xl
                        text-gray-900 dark:text-gray-100
                        placeholder-gray-600 dark:placeholder-gray-300
                        focus:border-blue-500/80 dark:focus:border-purple-500/80
                        focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                        shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                        hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                        transition-all duration-300"
                />
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 transform -translate-y-1/2 w-5 h-5
                    text-gray-500 dark:text-gray-400
                    group-focus-within:text-blue-600 dark:group-focus-within:text-purple-400
                    transition-colors duration-300"
                />
                {searchTerm && (
                    <button
                        type="button"
                        onClick={() => onSearchChange('')}
                        className="absolute right-3.5 top-1/2 transform -translate-y-1/2
                            text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100
                            transition-all duration-200
                            hover:scale-110
                            rounded-full p-0.5"
                        aria-label="Effacer la recherche"
                    >
                        <X aria-hidden="true" className="w-5 h-5" />
                    </button>
                )}
            </div>
        </search>
    );
}
