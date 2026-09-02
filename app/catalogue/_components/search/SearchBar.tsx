import React, { useId, useState } from 'react';
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
    const searchId = useId();
    const filterId = useId();
    const genreSearchId = useId();

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
        // role="search" gives the whole block a landmark, so a screen-reader user
        // can jump straight to it instead of tabbing through the header first.
        <search role="search" className="animate-fade-in">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:items-center">
                {/* Search input - 45% */}
                <div className="relative w-full sm:w-[45%] group">
                    {/* A placeholder is not a label: it disappears as soon as the field
                        has content, and several screen readers never announce it
                        (RGAA 11.1). The visible text is kept off-screen so the layout
                        is unchanged. */}
                    <label htmlFor={searchId} className="sr-only">
                        Rechercher un livre dans le catalogue
                    </label>
                    <input
                        id={searchId}
                        type="search"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Recherche de livres..."
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
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-gray-500 dark:text-gray-400 group-focus-within:text-blue-600 dark:group-focus-within:text-purple-400 transition-colors duration-300" size={20} />
                    {isSearching && (
                        <Loader2 aria-hidden="true" className="pointer-events-none absolute right-3.5 top-3.5 text-blue-600 dark:text-purple-400 animate-spin" size={20} />
                    )}
                    {!isSearching && searchTerm && (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            aria-label="Effacer la recherche"
                            className="absolute right-3.5 top-3.5 text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100 transition-colors rounded-full"
                        >
                            <X aria-hidden="true" size={20} />
                        </button>
                    )}
                </div>

                {/* Filter select - 20% */}
                <div className="w-full sm:w-[20%]">
                    <label htmlFor={filterId} className="sr-only">
                        Champ de recherche
                    </label>
                    <select
                        id={filterId}
                        value={selectedFilter}
                        onChange={(e) => onFilterChange(e.target.value)}
                        className="w-full px-4 py-3
                            bg-white/95 dark:bg-gray-700/95
                            backdrop-blur-xl
                            border-2 border-gray-300/50 dark:border-gray-600/50
                            rounded-xl
                            text-gray-900 dark:text-gray-100
                            focus:border-blue-500/80 dark:focus:border-purple-500/80
                            focus:ring-4 focus:ring-blue-500/20 dark:focus:ring-purple-500/20
                            shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                            hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                            transition-all duration-300
                            cursor-pointer"
                    >
                        <option value="all">Tous les champs</option>
                        <option value="title">Titre</option>
                        <option value="author">Auteur</option>
                        <option value="description">Description</option>
                        <option value="genre">Genre</option>
                    </select>
                </div>

                {/* Genre selector - 30% */}
                <div className="w-full sm:w-[30%]">
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            {/* No explicit role/aria-expanded here: the trigger opens a panel,
                                not a listbox, and Radix already sets aria-haspopup,
                                aria-expanded and aria-controls. Declaring role="combobox"
                                by hand described a widget the markup does not implement. */}
                            <Button
                                variant="outline"
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
                                        : "Filtrer par genre"}
                                </span>
                                <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-70"/>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[280px] p-0
                            bg-white/98 dark:bg-gray-800/98
                            backdrop-blur-xl
                            border-2 border-gray-200/50 dark:border-gray-700/50
                            shadow-[0_20px_60px_rgb(0,0,0,0.15)] dark:shadow-[0_20px_60px_rgb(0,0,0,0.4)]
                            rounded-xl">
                            <div className="p-3">
                                <label htmlFor={genreSearchId} className="sr-only">
                                    Rechercher un genre
                                </label>
                                <Input
                                    id={genreSearchId}
                                    type="search"
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
                                {/* Each option used to be a `div` with an onClick — no keyboard
                                    access, and nothing announced whether a genre was already
                                    selected. Real toggle buttons carry both. */}
                                <ul className="max-h-60 overflow-y-auto custom-scrollbar list-none p-0 m-0">
                                    {availableGenres
                                        .filter(genre =>
                                            genre.name.toLowerCase().includes(genreSearchQuery.toLowerCase())
                                        )
                                        .map((genre) => {
                                            const isSelected = selectedGenres.includes(genre.id);
                                            return (
                                                <li key={genre.id}>
                                                    <button
                                                        type="button"
                                                        aria-pressed={isSelected}
                                                        className="flex items-center w-full px-3 py-2 text-sm text-left
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
                                                            aria-hidden="true"
                                                            className={`mr-2 h-4 w-4 transition-all duration-200 ${
                                                                isSelected
                                                                    ? "opacity-100 text-blue-600 dark:text-purple-400 scale-100"
                                                                    : "opacity-0 scale-50"
                                                            }`}
                                                        />
                                                        <span className="group-hover:translate-x-0.5 transition-transform duration-200">
                                                            {genre.name}
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                </ul>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            {/* Selected genres tags */}
            {selectedGenres.length > 0 && (
                <>
                    <h2 id="filtres-actifs" className="sr-only">Filtres de genre actifs</h2>
                    <ul aria-labelledby="filtres-actifs" className="flex flex-wrap gap-2 mt-3 animate-fade-in list-none p-0">
                        {selectedGenres.map(genreId => {
                            const genre = availableGenres.find(g => g.id === genreId);
                            return genre ? (
                                <li
                                    key={genre.id}
                                    className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-purple-900/30
                                        text-blue-800 dark:text-blue-200
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
                                        aria-label={`Retirer le filtre ${genre.name}`}
                                        className="hover:text-blue-900 dark:hover:text-blue-400
                                            hover:scale-110
                                            transition-all duration-200
                                            rounded-full hover:bg-blue-200/50 dark:hover:bg-blue-800/50 p-0.5"
                                    >
                                        <X aria-hidden="true" className="h-3.5 w-3.5"/>
                                    </button>
                                </li>
                            ) : null;
                        })}
                    </ul>
                </>
            )}
        </search>
    );
};
