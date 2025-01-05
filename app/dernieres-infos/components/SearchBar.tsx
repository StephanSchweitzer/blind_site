'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import debounce from 'lodash/debounce';

interface NewsSearchResult {
    id: number;
    title: string;
    publishedAt: Date;
}

interface NewsSearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onResultSelect?: (id: number) => void;
    placeholder?: string;
}

export function SearchBar({
                                  searchTerm,
                                  onSearchChange,
                                  onResultSelect,
                                  placeholder = "Rechercher dans les actualités..."
                              }: NewsSearchBarProps) {
    const [results, setResults] = useState<NewsSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Debounced search function
    const debouncedSearch = debounce(async (term: string) => {
        if (!term.trim()) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`/api/news/search?term=${encodeURIComponent(term)}`);
            const data = await response.json();
            setResults(data);
        } catch (error) {
            console.error('Search error:', error);
            setResults([]);
        }
        setIsLoading(false);
    }, 300);

    useEffect(() => {
        debouncedSearch(searchTerm);
        return () => {
            debouncedSearch.cancel();
        };
    }, [searchTerm]);

    // Click outside handler
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleResultClick = (id: number) => {
        if (onResultSelect) {
            onResultSelect(id);
        }
        setShowResults(false);
    };

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onFocus={() => setShowResults(true)}
                    placeholder={placeholder}
                    className="w-full px-4 py-2 pl-10 bg-gray-700 border border-gray-600 rounded-lg
                             text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2
                             focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>

            {showResults && (searchTerm.trim() !== '') && (
                <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700
                                rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {isLoading ? (
                        <div className="p-4 text-center text-gray-400">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto"></div>
                        </div>
                    ) : results.length > 0 ? (
                        <ul className="py-2">
                            {results.map((result) => (
                                <li
                                    key={result.id}
                                    onClick={() => handleResultClick(result.id)}
                                    className="px-4 py-2 hover:bg-gray-700 cursor-pointer transition-colors duration-200"
                                >
                                    <div className="text-gray-100">{result.title}</div>
                                    <div className="text-sm text-gray-400">
                                        {new Date(result.publishedAt).toLocaleDateString('fr-FR')}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-4 text-center text-gray-400">
                            Aucun résultat trouvé
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}