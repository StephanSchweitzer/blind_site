// app/catalogue/_components/search/SearchBar.tsx
import React, { useState } from 'react';
import { Search, X, ChevronsUpDown, Check } from 'lucide-react';
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
    availableGenres: { id: number; name: string; }[];
}

export const SearchBar: React.FC<SearchBarProps> = ({
                                                        searchTerm,
                                                        onSearchChange,
                                                        selectedFilter,
                                                        onFilterChange,
                                                        selectedGenres,
                                                        onGenreChange,
                                                        availableGenres
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
        <div className="space-y-4">
            <div className="flex gap-2 w-full">
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search books..."
                        className="w-full px-4 py-2 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                </div>
                <select
                    value={selectedFilter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">All</option>
                    <option value="title">Title</option>
                    <option value="author">Author</option>
                    <option value="genre">Genre</option>
                </select>
            </div>

            <div>
                <div className="flex flex-wrap gap-2 mb-2">
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

                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            className="w-full justify-between"
                        >
                            Select genres...
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                        <div className="p-2">
                            <Input
                                placeholder="Search genres..."
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
    );
};