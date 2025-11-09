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
        <div className="animate-fade-in">
            <div className="flex gap-3 w-full items-center">
                {/* Search input - 45% */}
                <div className="relative w-[45%] group">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Recherche de livres..."
                        className="w-full px-4 py-3 pl-11 pr-11
                            bg-white/95 dark:bg-gray-700/95
                            backdrop-blur-xl
                            border-2 border-gray-300/50 dark:border-gray-600/50
                            rounded-xl
                            text-gray-900 dark:text-gray-100
                            placeholder-gray-500 dark:placeholder-gray-400
                            focus:outline-none
                            focus:border-blue-500/80 dark:focus:border-purple-500/80
                            focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                            shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                            hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                            transition-all duration-300"
                    />
                    <Search className="absolute left-3.5 top-3.5 text-gray-400 dark:text-gray-500 group-focus-within:text-blue-500 dark:group-focus-within:text-purple-400 transition-colors duration-300" size={20} />
                    {isSearching && (
                        <Loader2 className="absolute right-3.5 top-3.5 text-blue-500 dark:text-purple-400 animate-spin" size={20} />
                    )}
                    {!isSearching && searchTerm && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Filter select - 20% */}
                <select
                    value={selectedFilter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    className="w-[20%] px-4 py-3
                        bg-white/95 dark:bg-gray-700/95
                        backdrop-blur-xl
                        border-2 border-gray-300/50 dark:border-gray-600/50
                        rounded-xl
                        text-gray-900 dark:text-gray-100
                        focus:outline-none
                        focus:border-blue-500/80 dark:focus:border-purple-500/80
                        focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                        shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                        hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                        transition-all duration-300
                        cursor-pointer"
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
                                className="w-full justify-between h-[50px]
                                    bg-white/95 dark:bg-gray-700/95
                                    backdrop-blur-xl
                                    border-2 border-gray-300/50 dark:border-gray-600/50
                                    text-gray-900 dark:text-gray-100
                                    hover:bg-white dark:hover:bg-gray-700
                                    hover:border-blue-500/50 dark:hover:border-purple-500/50
                                    shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                                    hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                                    transition-all duration-300 rounded-xl"
                            >
                                <span className="truncate">
                                    {selectedGenres.length > 0
                                        ? `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''} sélectionné${selectedGenres.length > 1 ? 's' : ''}`
                                        : "Genres..."}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0
                            bg-white/98 dark:bg-gray-800/98
                            backdrop-blur-xl
                            border-2 border-gray-200/50 dark:border-gray-700/50
                            shadow-[0_20px_60px_rgb(0,0,0,0.15)] dark:shadow-[0_20px_60px_rgb(0,0,0,0.4)]
                            rounded-xl">
                            <div className="p-3">
                                <Input
                                    placeholder="Recherche de genres..."
                                    value={genreSearchQuery}
                                    onChange={(e) => setGenreSearchQuery(e.target.value)}
                                    className="mb-2
                                        bg-gray-50 dark:bg-gray-700/50
                                        border-gray-200 dark:border-gray-600
                                        text-gray-900 dark:text-gray-100
                                        focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                                        rounded-lg"
                                />
                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                    {availableGenres
                                        .filter(genre =>
                                            genre.name.toLowerCase().includes(genreSearchQuery.toLowerCase())
                                        )
                                        .map((genre) => (
                                            <div
                                                key={genre.id}
                                                className="flex items-center w-full px-3 py-2 text-sm
                                                    text-gray-900 dark:text-gray-100
                                                    hover:bg-blue-50 dark:hover:bg-blue-900/30
                                                    rounded-lg cursor-pointer
                                                    transition-all duration-200
                                                    group"
                                                onClick={() => {
                                                    handleGenreSelect(genre.id);
                                                    setGenreSearchQuery('');
                                                }}
                                            >
                                                <Check
                                                    className={`mr-2 h-4 w-4 transition-all duration-200 ${
                                                        selectedGenres.includes(genre.id)
                                                            ? "opacity-100 text-blue-600 dark:text-purple-400 scale-100"
                                                            : "opacity-0 scale-50"
                                                    }`}
                                                />
                                                <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                                                    {genre.name}
                                                </span>
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
                <div className="flex flex-wrap gap-2 mt-3 animate-fade-in">
                    {selectedGenres.map(genreId => {
                        const genre = availableGenres.find(g => g.id === genreId);
                        return genre ? (
                            <div
                                key={genre.id}
                                className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-purple-900/30
                                    text-blue-700 dark:text-blue-300
                                    rounded-full px-3 py-1.5 text-sm font-medium
                                    flex items-center gap-1.5
                                    border border-blue-200/50 dark:border-blue-700/50
                                    shadow-sm
                                    hover:shadow-md hover:scale-105
                                    transition-all duration-300
                                    animate-scale-in"
                            >
                                <span>{genre.name}</span>
                                <button
                                    type="button"
                                    onClick={() => removeGenre(genre.id)}
                                    className="hover:text-blue-900 dark:hover:text-blue-400
                                        hover:scale-110
                                        transition-all duration-200
                                        rounded-full hover:bg-blue-200/50 dark:hover:bg-blue-800/50 p-0.5"
                                >
                                    <X className="h-3.5 w-3.5"/>
                                </button>
                            </div>
                        ) : null;
                    })}
                </div>
            )}
        </div>
    );
};