// catalogue/search/SearchBar.tsx
import React, { useState } from 'react';
import { Search, X, ChevronsUpDown, Check, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SearchBarProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    selectedFilter: string;
    onFilterChange: (filter: string) => void;
    selectedGenres: number[];
    onGenreChange: (genres: number[]) => void;
    availableGenres: { id: number; name: string; description?: string | null; }[];
    isSearching?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
                                                        searchTerm,
                                                        onSearchChange,
                                                        selectedFilter,
                                                        onFilterChange,
                                                        selectedGenres,
                                                        onGenreChange,
                                                        availableGenres,
                                                        isSearching = false
                                                    }) => {
    const [open, setOpen] = useState(false);
    const [genreSearchQuery, setGenreSearchQuery] = useState('');

    const removeGenre = (genreId: number) => {
        onGenreChange(selectedGenres.filter(id => id !== genreId));
    };

    const handleGenreSelect = (genreId: number) => {
        if (selectedGenres.includes(genreId)) {
            removeGenre(genreId);
        } else {
            onGenreChange([...selectedGenres, genreId]);
        }
    };

    return (
        <div>
            <div className="flex gap-2 w-full items-center">
                {/* Search input - 45% */}
                <div className="relative w-[45%]">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Recherche de livres..."
                        className="w-full px-4 py-2 pl-10 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                    {isSearching && (
                        <Loader2 className="absolute right-3 top-2.5 text-gray-400 animate-spin" size={20} />
                    )}
                </div>

                {/* Filter select - 20% */}
                <select
                    value={selectedFilter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    className="w-[20%] px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Tous</option>
                    <option value="title">Titre</option>
                    <option value="author">Auteur</option>
                    <option value="description">Description</option>
                    <option value="genre">Genre</option>
                </select>

                {/* Genre selector - 30% */}
                <div className="w-[30%]">
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={open}
                                className="w-full justify-between"
                            >
                                {selectedGenres.length > 0
                                    ? `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''} selected`
                                    : "Genres..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0">
                            <div className="p-2">
                                <Input
                                    placeholder="Recherche de genres..."
                                    value={genreSearchQuery}
                                    onChange={(e) => setGenreSearchQuery(e.target.value)}
                                    className="mb-2"
                                />
                                <div className="max-h-60 overflow-y-auto">
                                    {availableGenres
                                        .filter(genre =>
                                            genre.name.toLowerCase().includes(genreSearchQuery.toLowerCase())
                                        )
                                        .map((genre) => (
                                            <div
                                                key={genre.id}
                                                className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-blue-50 rounded-sm cursor-pointer"
                                                onClick={() => {
                                                    handleGenreSelect(genre.id);
                                                    setGenreSearchQuery('');
                                                }}
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 ${
                                                        selectedGenres.includes(genre.id)
                                                            ? "opacity-100"
                                                            : "opacity-0"
                                                    }`}
                                                />
                                                {genre.name}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Selected genres tags */}
            {selectedGenres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                    {selectedGenres.map(genreId => {
                        const genre = availableGenres.find(g => g.id === genreId);
                        return genre ? (
                            <div
                                key={genre.id}
                                className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm flex items-center"
                            >
                                {genre.name}
                                <button
                                    type="button"
                                    onClick={() => removeGenre(genre.id)}
                                    className="ml-2 hover:text-blue-600"
                                >
                                    <X className="h-3 w-3"/>
                                </button>
                            </div>
                        ) : null;
                    })}
                </div>
            )}
        </div>
    );
};