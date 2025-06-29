'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X, ChevronsUpDown, Check, Plus, Loader2 } from 'lucide-react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddBookFormBackend, EditBookFormBackend } from '@/admin/BookFormBackendBase';
import { toast } from "@/hooks/use-toast";

const ITEMS_PER_PAGE = 10;
const DEBOUNCE_DELAY = 300;

interface BookFormData {
    title: string;
    subtitle: string,
    author: string;
    publisher: string | undefined;
    publishedYear: string;
    genres: string[];
    isbn: string | undefined;
    description: string | undefined;
    available: boolean;
    readingDurationMinutes: number | undefined;
    pageCount: number | undefined;
    [key: string]: string | number | boolean | string[] | undefined;
}

interface Book {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    isbn: string | null;
    readingDurationMinutes: number | null;
    pageCount: number | null;
    available: boolean;
    genres: {
        genre: {
            id: number;
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
    publisher: string | null;
    createdAt: Date | null;
}

interface BookWithFormData extends Book {
    formData: BookFormData;
}

interface SearchResult {
    books: Book[];
    total: number;
    totalPages: number;
    page: number;
}

interface BooksTableProps {
    initialBooks: Book[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
    availableGenres?: { id: number; name: string; }[];
    initialTotalBooks: number;
}

export default function BooksTable({
                                       initialBooks = [],
                                       initialSearch = '',
                                       totalPages: initialTotalPages = 1,
                                       availableGenres = [],
                                       initialTotalBooks = 0
                                   }: BooksTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Search state
    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [selectedFilter, setSelectedFilter] = useState(searchParams?.get('filter') || 'all');
    const [currentPage, setCurrentPage] = useState(parseInt(searchParams?.get('page') || '1'));
    const [selectedGenres, setSelectedGenres] = useState<number[]>(() => {
        const genresParam = searchParams?.get('genres');
        return genresParam ? genresParam.split(',').map(Number).filter(id => !isNaN(id)) : [];
    });

    // UI state
    const [genreSearchQuery, setGenreSearchQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedBook, setSelectedBook] = useState<BookWithFormData | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Results state - initialize with server data
    const [searchResults, setSearchResults] = useState<SearchResult>(() => ({
        books: initialBooks,
        total: initialTotalBooks,
        page: parseInt(searchParams?.get('page') || '1'),
        totalPages: initialTotalPages
    }));

    // Refs for debouncing, request cancellation, and caching
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const initialDataRef = useRef({
        books: initialBooks,
        total: initialTotalBooks,
        totalPages: initialTotalPages
    });

    // Track if initial load had any filters
    const initialHadFilters = useRef(
        initialSearch ||
        (searchParams?.get('filter') && searchParams?.get('filter') !== 'all') ||
        (searchParams?.get('genres')?.length || 0) > 0
    );

    // Update URL without page reload
    const updateURL = useCallback((
        search: string,
        filter: string,
        genres: number[],
        page: number
    ) => {
        const params = new URLSearchParams();

        if (search) params.set('search', search);
        if (filter !== 'all') params.set('filter', filter);
        if (genres.length > 0) params.set('genres', genres.join(','));
        if (page > 1) params.set('page', page.toString());

        const url = `/admin/books${params.toString() ? `?${params.toString()}` : ''}`;
        router.replace(url, { scroll: false });
    }, [router]);

    // Perform search with debouncing and caching
    const performSearch = useCallback(async (
        term: string,
        filter: string,
        genreIds: number[],
        page: number
    ) => {
        // Cancel any pending search
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Update URL
        updateURL(term, filter, genreIds, page);

        // Only use cached data if initial load was clean (no filters) and we're going back to clean state
        if (!term && genreIds.length === 0 && page === 1 && filter === 'all' && !initialHadFilters.current) {
            setSearchResults({
                books: initialDataRef.current.books,
                total: initialDataRef.current.total,
                page: 1,
                totalPages: initialDataRef.current.totalPages
            });
            setIsSearching(false);
            return;
        }

        // Set loading state
        setIsSearching(true);
        setError(null);

        // Create new abort controller
        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const params = new URLSearchParams({
                search: term,
                filter,
                page: page.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });

            genreIds.forEach(id => params.append('genres', id.toString()));

            const response = await fetch(`/api/books?${params}`, {
                signal: abortController.signal,
                headers: {
                    'Cache-Control': 'no-store',
                },
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            setSearchResults(data);
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError('Une erreur s\'est produite lors de la recherche');
                console.error('Search error:', err);
            }
        } finally {
            setIsSearching(false);
        }
    }, [updateURL]);

    // Debounced search effect
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            performSearch(searchTerm, selectedFilter, selectedGenres, currentPage);
        }, searchTerm ? DEBOUNCE_DELAY : 0);

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchTerm, selectedFilter, selectedGenres, currentPage, performSearch]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    // Event handlers with proper reset logic
    const handleSearchChange = useCallback((value: string) => {
        setSearchTerm(value);
        if (currentPage !== 1) {
            setCurrentPage(1);
        }
    }, [currentPage]);

    const handleFilterChange = useCallback((filter: string) => {
        setSelectedFilter(filter);
        setCurrentPage(1);
    }, []);

    const handleGenreChange = useCallback((genres: number[]) => {
        setSelectedGenres(genres);
        setCurrentPage(1);
    }, []);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);

    const removeGenre = (genreId: number) => {
        const newGenres = selectedGenres.filter(id => id !== genreId);
        handleGenreChange(newGenres);
    };

    const handleGenreSelect = (genreId: number) => {
        if (selectedGenres.includes(genreId)) {
            removeGenre(genreId);
        } else {
            handleGenreChange([...selectedGenres, genreId]);
        }
    };

    const openBookEditModal = async (book: Book, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }

        setIsSearching(true);

        try {
            const response = await fetch(`/api/books/${book.id}`);
            if (!response.ok) {
                throw new Error('Failed to fetch book details');
            }
            const bookDetails = await response.json();

            const genreIds = bookDetails.genres.map((g: { genre: { id: number } }) => g.genre.id);

            const formData: BookFormData = {
                title: bookDetails.title,
                subtitle: bookDetails.subtitle,
                author: bookDetails.author,
                publisher: bookDetails.publisher || undefined,
                publishedYear: bookDetails.publishedDate ?
                    new Date(bookDetails.publishedDate).getFullYear().toString() :
                    new Date().getFullYear().toString(),
                genres: genreIds.map(String),
                isbn: bookDetails.isbn || undefined,
                description: bookDetails.description || undefined,
                available: Boolean(bookDetails.available),
                readingDurationMinutes: bookDetails.readingDurationMinutes || undefined,
                pageCount: bookDetails.pageCount || undefined,
            };

            const selectedBookWithForm: BookWithFormData = {
                ...bookDetails,
                formData
            };

            setSelectedBook(selectedBookWithForm);
            setIsEditModalOpen(true);
        } catch (error) {
            console.error('Error fetching book details:', error);
            toast({
                title: "Erreur",
                description: "Échec du chargement des détails du livre. Veuillez réessayer.",
                variant: "destructive"
            });
        } finally {
            setIsSearching(false);
        }
    };

    const handleBookEdited = async (bookId: number, isDeleted = false) => {
        if (isDeleted) {
            setSearchResults(prev => ({
                ...prev,
                books: prev.books.filter(book => book.id !== bookId),
                total: prev.total - 1
            }));
            setIsEditModalOpen(false);
            setSelectedBook(null);
            return;
        }

        // Refresh current search to get updated data
        performSearch(searchTerm, selectedFilter, selectedGenres, currentPage);
        setIsEditModalOpen(false);
        setSelectedBook(null);
    };

    const handleBookAdded = async () => {
        // Refresh current search to include new book
        performSearch(searchTerm, selectedFilter, selectedGenres, currentPage);
        setIsAddModalOpen(false);
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

    const visiblePages = getVisiblePages(currentPage, searchResults.totalPages);

    const getGenreName = (genreId: number) => {
        return availableGenres?.find(g => g.id === genreId)?.name || '';
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                <div>
                    <CardTitle className="text-gray-100">Gestion des livres</CardTitle>
                    <CardDescription className="text-gray-400">
                        {searchResults.total} livre{searchResults.total !== 1 ? 's' : ''} au total
                    </CardDescription>
                </div>
                <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => setIsAddModalOpen(true)}
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Ajouter un livre
                </Button>
            </CardHeader>
            <CardContent className="pt-6">
                {/* Enhanced Search and filters with loading feedback */}
                <div className="space-y-4">
                    <div className="flex gap-2 w-full items-center">
                        <div className="relative w-[45%]">
                            <Input
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Recherche de livres..."
                                className="pl-10 pr-10 bg-gray-800 text-gray-200 border-gray-700 placeholder:text-gray-500"
                            />
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
                            {isSearching && searchTerm.length > 0 && (
                                <Loader2 className="absolute right-3 top-2.5 text-gray-400 animate-spin" size={20} />
                            )}
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
                        )}
                    </div>

                    {/* Selected genres tags */}
                    {selectedGenres.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {selectedGenres.map(genreId => {
                                const genreName = getGenreName(genreId);
                                return genreName ? (
                                    <div
                                        key={genreId}
                                        className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm flex items-center"
                                    >
                                        {genreName}
                                        <button
                                            type="button"
                                            onClick={() => removeGenre(genreId)}
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

                {/* Error message */}
                {error && (
                    <div className="text-center py-4 bg-red-900/50 text-red-200 rounded-lg border border-red-800 mt-4">
                        {error}
                    </div>
                )}

                {/* Enhanced table with loading states and visual feedback */}
                <div className="relative mt-4">
                    {isSearching && searchResults.books.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 bg-gray-800 rounded-lg">
                            <Loader2 className="animate-spin h-12 w-12 text-blue-400" />
                            <p className="mt-4 text-gray-300">Recherche en cours...</p>
                        </div>
                    ) : searchResults.books.length === 0 ? (
                        <div className="text-center py-12 bg-gray-800 rounded-lg">
                            <p className="text-gray-300">
                                {searchTerm || selectedGenres.length > 0
                                    ? 'Aucun résultat trouvé pour votre recherche'
                                    : 'Aucun livre disponible'}
                            </p>
                        </div>
                    ) : (
                        <div className={`transition-opacity duration-200 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>
                            <div className="rounded-md border border-gray-700 bg-gray-800">
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
                                        {searchResults.books.map((book) => (
                                            <TableRow
                                                key={book.id}
                                                className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                                onClick={() => openBookEditModal(book)}
                                            >
                                                <TableCell className="text-gray-200">
                                                    <div>
                                                        <div className="font-medium">{book.title}</div>
                                                        {book.subtitle && (
                                                            <div className="text-sm text-gray-400">{book.subtitle}</div>
                                                        )}
                                                        {book.isbn && (
                                                            <div className="text-sm text-gray-500">
                                                                ISBN: {book.isbn}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">{book.author}</TableCell>
                                                <TableCell className="text-gray-200">
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {book.genres?.slice(0, 2).map((g, idx) => (
                                                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800 whitespace-nowrap">
                                                                {g.genre.name}
                                                            </span>
                                                        ))}
                                                        {book.genres?.length > 2 && (
                                                            <span className="text-xs text-gray-400 whitespace-nowrap">+{book.genres.length - 2} plus</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    {book.readingDurationMinutes
                                                        ? `${Math.floor(book.readingDurationMinutes / 60)}h ${book.readingDurationMinutes % 60}min`
                                                        : 'N/D'
                                                    }
                                                </TableCell>
                                                <TableCell className="text-gray-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                                        book.available
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {book.available ? 'Disponible' : 'Indisponible'}
                                                    </span>
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                                        onClick={(e) => openBookEditModal(book, e)}
                                                    >
                                                        Modifier
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Enhanced Pagination */}
                {searchResults.totalPages > 1 && (
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
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                                    onClick={() => handlePageChange(page)}
                                >
                                    {page}
                                </Button>
                            ) : (
                                <span key={index} className="text-gray-400 px-2">{page}</span>
                            )
                        ))}
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === searchResults.totalPages}
                        >
                            {'>'}
                        </Button>
                        <Button
                            size="sm"
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                            onClick={() => handlePageChange(searchResults.totalPages)}
                            disabled={currentPage === searchResults.totalPages}
                        >
                            {'>>'}
                        </Button>
                    </div>
                )}

                {searchResults.totalPages > 1 && (
                    <p className="text-center text-sm text-gray-400 mt-2">
                        Page {currentPage} sur {searchResults.totalPages}
                    </p>
                )}
            </CardContent>

            {/* Add Book Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-gray-100">Ajouter un nouveau livre</DialogTitle>
                    </DialogHeader>
                    <div className="overflow-y-auto px-1">
                        <AddBookFormBackend onSuccess={handleBookAdded} />
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Book Modal */}
            {selectedBook && (
                <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700">
                        <DialogHeader>
                            <DialogTitle className="text-gray-100">Modifier le livre</DialogTitle>
                        </DialogHeader>
                        <div className="overflow-y-auto px-1">
                            <EditBookFormBackend
                                bookId={selectedBook.id.toString()}
                                initialData={selectedBook.formData}
                                onSuccess={handleBookEdited}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Card>
    );
}