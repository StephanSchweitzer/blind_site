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
        <Command shouldFilter={false} className="rounded-lg border shadow-md">
            <CommandInput
                value={searchTerm}
                onValueChange={handleInputChange}
                onFocus={() => {
                    if (searchTerm.trim() && results.length > 0) {
                        setShowResults(true);
                    }
                }}
                placeholder="Rechercher les coups de coeur..."
            />
            <div className={showResults && searchTerm.trim() ? "block" : "hidden"}>
                <CommandList>
                    {isSearching ? (
                        <CommandEmpty>Recherche en cours...</CommandEmpty>
                    ) : results.length === 0 ? (
                        <CommandEmpty>Aucun résultat trouvé</CommandEmpty>
                    ) : (
                        <CommandGroup>
                            {results.map((result) => (
                                <CommandItem
                                    key={result.id}
                                    value={result.title}
                                    onSelect={() => handleSelect(result)}
                                    className="cursor-pointer"
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="font-medium">{result.title}</div>
                                        <div className="text-sm text-muted-foreground line-clamp-2">
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