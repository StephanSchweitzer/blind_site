// app/books/BooksClient.tsx
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SearchBar } from '@/catalogue/search/SearchBar';
import { BookList } from '@/catalogue/search/BookList';
import { BookModal } from '@/components/BookModal';
import { CustomPagination } from "@/components/ui/custom-pagination";
import { BookWithGenres, SearchResult } from '@/types/book';

const ITEMS_PER_PAGE = 9;
const DEBOUNCE_DELAY = 300;

interface BooksClientProps {
    initialBooks: BookWithGenres[];
    genres: { id: number; name: string; description: string | null; }[];
    totalBooks: number;
    totalPages: number;
}

export function BooksClient({
                                initialBooks,
                                genres,
                                totalBooks: initialTotalBooks,
                                totalPages: initialTotalPages
                            }: BooksClientProps) {
    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);

    // UI state
    const [selectedBook, setSelectedBook] = useState<BookWithGenres | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Results state
    const [searchResults, setSearchResults] = useState<SearchResult>({
        books: initialBooks,
        total: initialTotalBooks,
        page: 1,
        totalPages: initialTotalPages
    });

    // Refs for debouncing and request cancellation
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Perform search
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

        // If no search criteria, return to initial data
        if (!term && genreIds.length === 0 && page === 1) {
            setSearchResults({
                books: initialBooks,
                total: initialTotalBooks,
                page: 1,
                totalPages: initialTotalPages
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
    }, [initialBooks, initialTotalBooks, initialTotalPages]);

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

    // Event handlers
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

    const handleBookClick = useCallback((book: BookWithGenres) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    }, []);

    return (
        <div className="space-y-8">
            <SearchBar
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                selectedFilter={selectedFilter}
                onFilterChange={handleFilterChange}
                selectedGenres={selectedGenres}
                onGenreChange={handleGenreChange}
                availableGenres={genres}
                isSearching={isSearching && searchTerm.length > 0}
            />

            {error && (
                <div className="text-center py-4 bg-red-900/50 text-red-200 rounded-lg">
                    {error}
                </div>
            )}

            <div className="relative min-h-[200px]">
                {isSearching && searchResults.books.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                        <p className="mt-4 text-gray-300">Recherche en cours...</p>
                    </div>
                ) : searchResults.books.length === 0 ? (
                    <div className="text-center py-8 bg-gray-700 rounded-lg">
                        <p className="text-gray-300">
                            {searchTerm || selectedGenres.length > 0
                                ? 'Aucun résultat trouvé pour votre recherche'
                                : 'Aucun livre disponible'}
                        </p>
                    </div>
                ) : (
                    <div className={`transition-opacity duration-200 ${isSearching ? 'opacity-50' : 'opacity-100'}`}>
                        <BookList books={searchResults.books} onBookClick={handleBookClick} />
                    </div>
                )}
            </div>

            {searchResults.totalPages > 1 && (
                <CustomPagination
                    currentPage={currentPage}
                    totalPages={searchResults.totalPages}
                    onPageChange={setCurrentPage}
                />
            )}

            <BookModal
                book={selectedBook}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
            />
        </div>
    );
}