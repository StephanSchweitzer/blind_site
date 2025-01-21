'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, X, ChevronsUpDown, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebounce } from 'use-debounce';

type Book = {
    id: number;
    title: string;
    author: string;
    isbn?: string | null;
    readingDurationMinutes?: number | null;
    available: boolean;
    genres: {
        genre: {
            name: string;
        };
    }[];
    addedBy: {
        name: string | null;
        email: string;
    };
    publishedDate: Date | null;
    description: string | null;
    addedById: number;
};

interface BooksTableProps {
    initialBooks: Book[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableGenres?: { id: number; name: string; }[];
}

export function BooksTable({
                               initialBooks = [],
                               initialPage = 1,
                               initialSearch = '',
                               totalPages = 1,
                               availableGenres = []
                           }: BooksTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [books, setBooks] = useState<Book[]>(initialBooks);
    const [search, setSearch] = useState(initialSearch);
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [genreSearchQuery, setGenreSearchQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [debouncedSearch] = useDebounce(search, 300);

    // Get current page from URL with fallback
    const currentPage = parseInt(searchParams?.get('page') || '1');

    useEffect(() => {
        if (Array.isArray(initialBooks)) {
            setBooks(initialBooks);
        }
    }, [initialBooks]);

    useEffect(() => {
        if (!searchParams) return;

        const searchFromUrl = searchParams.get('search') || '';
        setSearch(searchFromUrl);

        const filterFromUrl = searchParams.get('filter') || 'all';
        setSelectedFilter(filterFromUrl);

        const genresFromUrl = searchParams.get('genres')?.split(',').map(Number) || [];
        setSelectedGenres(genresFromUrl.filter(g => !isNaN(g)));
    }, [searchParams]);

    const handleSearch = (value: string) => {
        setSearch(value);
        updateSearchParams(value, selectedFilter, selectedGenres);
    };

    const handleFilterChange = (filter: string) => {
        setSelectedFilter(filter);
        updateSearchParams(search, filter, selectedGenres);
    };

    const handleGenreChange = (genres: number[]) => {
        setSelectedGenres(genres);
        updateSearchParams(search, selectedFilter, genres);
    };

    const updateSearchParams = (searchValue: string, filter: string, genres: number[]) => {
        if (!searchParams) return;

        const params = new URLSearchParams(searchParams.toString());
        if (searchValue) params.set('search', searchValue);
        else params.delete('search');

        if (filter !== 'all') params.set('filter', filter);
        else params.delete('filter');

        if (genres.length > 0) params.set('genres', genres.join(','));
        else params.delete('genres');

        params.set('page', '1'); // Reset to first page on search
        router.push(`?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        if (!searchParams) return;

        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
    };

    const removeGenre = (genreId: number) => {
        const newGenres = selectedGenres.filter(id => id !== genreId);
        handleGenreChange(newGenres);
    };

    const getVisiblePages = (current: number, total: number) => {
        const delta = 2;
        const range = [];
        for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            range.push(i);
        }
        if (current - delta > 2) range.unshift('...');
        if (current + delta < total - 1) range.push('...');
        range.unshift(1);
        if (total > 1) range.push(total);
        return range;
    };

    const visiblePages = getVisiblePages(currentPage, totalPages);

    const getGenreName = (genreId: number) => {
        return availableGenres?.find(g => g.id === genreId)?.name || '';
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                <div>
                    <CardTitle className="text-gray-100">Gestion des livres</CardTitle>
                    <CardDescription className="text-gray-400">
                        Gérer et modifiez les livres
                    </CardDescription>
                </div>
                <Link href="/admin/books/new">
                    <Button className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500">
                        Ajouter un nouveau livre
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="space-y-4">
                    <div className="flex gap-2 w-full items-center">
                        <div className="relative w-[45%]">
                            <Input
                                value={search}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Recherche de livres..."
                                className="pl-10 bg-gray-800 text-gray-200 border-gray-700 placeholder:text-gray-500"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                        </div>

                        <select
                            value={selectedFilter}
                            onChange={(e) => handleFilterChange(e.target.value)}
                            className="w-[20%] px-4 py-2 rounded-md bg-gray-800 text-gray-200 border-gray-700 focus:ring-2 focus:ring-gray-600"
                        >
                            <option value="all">Tous</option>
                            <option value="title">Titre</option>
                            <option value="author">Auteur</option>
                            <option value="description">Description</option>
                            <option value="genre">Genre</option>
                        </select>

                        {availableGenres && availableGenres.length > 0 && (
                            <div className="w-[30%]">
                                <Popover open={open} onOpenChange={setOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={open}
                                            className="w-full justify-between bg-gray-800 text-gray-200 border-gray-700"
                                        >
                                            {selectedGenres.length > 0
                                                ? `${selectedGenres.length} genre${selectedGenres.length > 1 ? 's' : ''} sélectionné${selectedGenres.length > 1 ? 's' : ''}`
                                                : "Sélectionner des genres..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[250px] p-0 bg-gray-800 border-gray-700">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Rechercher des genres..."
                                                value={genreSearchQuery}
                                                onChange={(e) => setGenreSearchQuery(e.target.value)}
                                                className="mb-2 bg-gray-700 text-gray-200 border-gray-600"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {availableGenres
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(genreSearchQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-700 rounded-sm cursor-pointer"
                                                            onClick={() => {
                                                                const newGenres = selectedGenres.includes(genre.id)
                                                                    ? selectedGenres.filter(id => id !== genre.id)
                                                                    : [...selectedGenres, genre.id];
                                                                handleGenreChange(newGenres);
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
                        )}
                    </div>

                    {selectedGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {selectedGenres.map(genreId => {
                                const genreName = getGenreName(genreId);
                                return genreName ? (
                                    <div
                                        key={genreId}
                                        className="bg-gray-700 text-gray-200 rounded-full px-3 py-1 text-sm flex items-center"
                                    >
                                        {genreName}
                                        <button
                                            type="button"
                                            onClick={() => removeGenre(genreId)}
                                            className="ml-2 hover:text-gray-400"
                                        >
                                            <X className="h-3 w-3"/>
                                        </button>
                                    </div>
                                ) : null;
                            })}
                        </div>
                    )}
                </div>

                <div className="rounded-md border border-gray-700 bg-gray-800 mt-4">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-700 bg-gray-800">
                                <TableHead className="text-gray-200 font-medium">Titre</TableHead>
                                <TableHead className="text-gray-200 font-medium">Auteur</TableHead>
                                <TableHead className="text-gray-200 font-medium">Genres</TableHead>
                                <TableHead className="text-gray-200 font-medium">Durée de lecture</TableHead>
                                <TableHead className="text-gray-200 font-medium">Disponible</TableHead>
                                <TableHead className="text-gray-200 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {books && books.map((book) => (
                                <TableRow key={book.id} className="border-b border-gray-700 hover:bg-gray-750">
                                    <TableCell className="text-gray-200">
                                        <div>
                                            <div>{book.title}</div>
                                            {book.isbn && (
                                                <div className="text-sm text-gray-400">
                                                    ISBN: {book.isbn}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-gray-200">{book.author}</TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.genres?.map(g => g.genre.name).join(', ') || 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.readingDurationMinutes
                                            ? `${book.readingDurationMinutes} mins`
                                            : 'N/A'
                                        }
                                    </TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.available ? 'Oui' : 'Non'}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/books/${book.id}`}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                            >
                                                Editer
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-center items-center gap-2 mt-6">
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                    >
                        {'<<'}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        {'<'}
                    </Button>
                    {visiblePages.map((page, index) => (
                        typeof page === 'number' ? (
                            <Button
                                key={index}
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                className={currentPage === page
                                    ? "bg-white text-gray-900 hover:bg-gray-100"
                                    : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                                onClick={() => handlePageChange(page)}
                            >
                                {page}
                            </Button>
                        ) : (
                            <span key={index} className="text-gray-400">{page}</span>
                        )
                    ))}
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        {'>'}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                    >
                        {'>>'}
                    </Button>
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">
                    Page {currentPage} sur {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}