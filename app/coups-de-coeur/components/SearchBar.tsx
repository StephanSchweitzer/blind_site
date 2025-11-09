import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

interface SearchPreviewResult {
    id: number;
    title: string;
    description: string;
}

interface SearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onResultSelect?: (id: number) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
                                                        searchTerm,
                                                        onSearchChange,
                                                        onResultSelect,
                                                    }) => {
    const [results, setResults] = useState<SearchPreviewResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [debouncedValue] = useDebounce(searchTerm, 300);

    useEffect(() => {
        const searchCoupsDeCoeur = async () => {
            if (!debouncedValue.trim()) {
                setResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const response = await fetch(`/api/coups-de-coeur/preview?search=${encodeURIComponent(debouncedValue)}`);
                if (response.ok) {
                    const data = await response.json();
                    setResults(data);
                    if (data.length > 0) {
                        setShowResults(true);
                    }
                }
            } catch (error) {
                console.error('Error searching:', error);
            } finally {
                setIsSearching(false);
            }
        };

        searchCoupsDeCoeur();
    }, [debouncedValue]);

    const handleSelect = (result: SearchPreviewResult) => {
        if (onResultSelect) {
            onResultSelect(result.id);
        }
        setShowResults(false);
    };

    const handleInputChange = (value: string) => {
        onSearchChange(value);
        if (value.trim()) {
            setShowResults(true);
        } else {
            setShowResults(false);
        }
    };

    return (
        <Command
            shouldFilter={false}
            className="rounded-2xl
                bg-white/95 dark:bg-gray-700/95
                backdrop-blur-xl backdrop-saturate-150
                border-2 border-gray-300/50 dark:border-gray-600/50
                shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                transition-all duration-300
                overflow-hidden"
        >
            <CommandInput
                value={searchTerm}
                onValueChange={handleInputChange}
                onFocus={() => {
                    if (searchTerm.trim() && results.length > 0) {
                        setShowResults(true);
                    }
                }}
                placeholder="Rechercher les listes de livres..."
                className="border-none
                    focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                    text-gray-900 dark:text-gray-100
                    placeholder-gray-500 dark:placeholder-gray-400
                    py-3"
            />
            <div className={`transition-all duration-300 ${showResults && searchTerm.trim() ? "block" : "hidden"}`}>
                <CommandList className="max-h-80 custom-scrollbar">
                    {isSearching ? (
                        <CommandEmpty className="py-8 text-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="relative">
                                    <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-200 dark:border-purple-900"></div>
                                    <div className="absolute inset-0 animate-spin rounded-full h-10 w-10 border-3 border-transparent border-t-blue-600 dark:border-t-purple-400"></div>
                                </div>
                                <span className="text-gray-600 dark:text-gray-400 font-medium">Recherche en cours...</span>
                            </div>
                        </CommandEmpty>
                    ) : results.length === 0 ? (
                        <CommandEmpty className="py-8 text-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                    <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <span className="text-gray-600 dark:text-gray-400 font-medium">Aucun résultat trouvé</span>
                            </div>
                        </CommandEmpty>
                    ) : (
                        <CommandGroup>
                            {results.map((result, index) => (
                                <CommandItem
                                    key={result.id}
                                    value={result.title}
                                    onSelect={() => handleSelect(result)}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                    className="cursor-pointer
                                        p-4 m-2 rounded-xl
                                        bg-gray-50/50 dark:bg-gray-700/30
                                        hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30
                                        border border-gray-200/50 dark:border-gray-600/30
                                        hover:border-blue-300/50 dark:hover:border-purple-500/50
                                        hover:shadow-md
                                        transition-all duration-300
                                        hover:scale-[1.02]
                                        animate-fade-in-up
                                        group"
                                >
                                    <div className="flex flex-col gap-2">
                                        <div className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors duration-300">
                                            {result.title}
                                        </div>
                                        <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                            {result.description}
                                        </div>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </div>
        </Command>
    );
};