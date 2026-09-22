'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SearchBar } from '@/catalogue/search/SearchBar';
import { BookList } from '@/catalogue/search/BookList';
import { BookModal } from '@/components/BookModal';
import { CustomPagination } from "@/components/ui/custom-pagination";
import { SearchResult } from '@/types/book';
import type { PublicBook } from '@/lib/books/publicBook';
import { BookSearchSuggestions } from '@/components/ui/book-search-suggestions';
import type { BookSearchSuggestion, CatalogueFilterKey } from '@/lib/books/book-suggestion-types';

/** The « Rechercher dans » options, as the search bar words them. */
const SEARCH_FIELD_LABELS: Record<string, string> = {
    title: 'Titre',
    author: 'Auteur',
    description: 'Description',
    genre: 'Genre',
};

const ITEMS_PER_PAGE = 9;
const DEBOUNCE_DELAY = 300;

interface BooksClientProps {
    initialBooks: PublicBook[];
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
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [selectedBook, setSelectedBook] = useState<PublicBook | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchResults, setSearchResults] = useState<SearchResult>({
        books: initialBooks,
        total: initialTotalBooks,
        page: 1,
        totalPages: initialTotalPages
    });

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const performSearch = useCallback(async (
        term: string,
        filter: string,
        genreIds: number[],
        page: number
    ) => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

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

        setIsSearching(true);
        setError(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        try {
            const params = new URLSearchParams({
                search: term,
                filter,
                page: page.toString(),
                limit: ITEMS_PER_PAGE.toString(),
                // « Vouliez-vous dire … ? » when nothing is found — see lib/search-suggest.ts.
                suggest: '1',
            });

            genreIds.forEach(id => params.append('genres', id.toString()));

            // /api/catalogue, not /api/books: the public route never returns
            // hidden books or internal fields, whoever is signed in.
            const response = await fetch(`/api/catalogue?${params}`, {
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            if (abortControllerRef.current !== abortController) return;
            setSearchResults(data);
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                setError('Une erreur s\'est produite lors de la recherche');
                console.error('Search error:', err);
            }
        } finally {
            // A superseded request settles after its replacement has started:
            // clearing the flag here would hide the spinner while the newer
            // search is still in flight, leaving stale results on screen.
            if (abortControllerRef.current === abortController) {
                abortControllerRef.current = null;
                setIsSearching(false);
            }
        }
    }, [initialBooks, initialTotalBooks, initialTotalPages]);

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

    const handleSearchChange = useCallback((value: string) => {
        // Drop the in-flight request at the keystroke rather than when the
        // debounce fires, so its older results can't land mid-typing, and show
        // the pending state straight away instead of 300 ms later.
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsSearching(true);
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

    const handleBookClick = useCallback((book: PublicBook) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    }, []);

    // The « Essayez plutôt » block — see components/ui/book-search-suggestions.tsx.
    // A visitor can only have set « Rechercher dans » and genres; the hidden
    // books stay out whatever is lifted (listPublicBooks).
    const suggestionFilterLabel = (key: CatalogueFilterKey): string => {
        if (key === 'filter') return `Rechercher dans : ${SEARCH_FIELD_LABELS[selectedFilter] ?? selectedFilter}`;
        const names = selectedGenres
            .map((id) => genres.find((g) => g.id === id)?.name)
            .filter(Boolean);
        return `${names.length > 1 ? 'Genres' : 'Genre'} : ${names.join(', ')}`;
    };

    const suggestionBookNote = (book: PublicBook, lifted: CatalogueFilterKey[]): string | null =>
        lifted.includes('genres') ? book.genres.map((g) => g.genre.name).join(', ') || 'Sans genre' : null;

    const applySuggestion = (suggestion: BookSearchSuggestion<PublicBook>) => {
        if (suggestion.lifted.includes('filter')) setSelectedFilter('all');
        if (suggestion.lifted.includes('genres')) setSelectedGenres([]);
        handleSearchChange(suggestion.query);
    };

    const handleGenreClickFromModal = useCallback((genreId: number) => {
        if (!selectedGenres.includes(genreId)) {
            setSelectedGenres(prev => [...prev, genreId]);
            setCurrentPage(1);
        }
        setIsModalOpen(false);
    }, [selectedGenres]);

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
                <div role="alert" className="text-center py-4 bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 rounded-lg">
                    {error}
                </div>
            )}

            {/* The result list is replaced without a page load. Without a live
                region a screen-reader user types into the search field and gets
                no feedback at all that anything happened (RGAA 7.4). */}
            <p role="status" aria-live="polite" className="sr-only">
                {isSearching
                    ? 'Recherche en cours…'
                    : searchResults.total === 0
                        ? (searchResults.searchSuggestions?.length
                            ? 'Aucun livre ne correspond à votre recherche. Des suggestions sont proposées ci-dessous.'
                            : 'Aucun livre ne correspond à votre recherche.')
                        : `${searchResults.total} livre${searchResults.total > 1 ? 's' : ''} trouvé${searchResults.total > 1 ? 's' : ''}, page ${currentPage} sur ${searchResults.totalPages}.`}
            </p>

            <div className="relative min-h-[200px]">
                {isSearching && searchResults.books.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div aria-hidden="true" className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
                        <p className="mt-4 text-gray-700 dark:text-gray-300">Recherche en cours...</p>
                    </div>
                ) : searchResults.books.length === 0 ? (
                    <div className="text-center py-8 glass-card">
                        <p className="text-gray-700 dark:text-gray-300">
                            {searchTerm || selectedGenres.length > 0
                                ? 'Aucun résultat trouvé pour votre recherche'
                                : 'Aucun livre disponible'}
                        </p>
                        {searchTerm && (
                            <BookSearchSuggestions
                                suggestions={searchResults.searchSuggestions}
                                filterLabel={suggestionFilterLabel}
                                bookNote={suggestionBookNote}
                                onApply={applySuggestion}
                                onOpenBook={handleBookClick}
                                className="px-4"
                            />
                        )}
                    </div>
                ) : (
                    <section
                        aria-labelledby="resultats-catalogue"
                        className={`transition-opacity duration-200 ${isSearching ? 'opacity-50' : 'opacity-100'}`}
                    >
                        {/* The card titles are h3. Without this the page jumped
                            straight from h1 to h3, and heading-by-heading
                            navigation lost a level (RGAA 9.1). */}
                        <h2 id="resultats-catalogue" className="sr-only">Résultats du catalogue</h2>
                        <BookList books={searchResults.books} onBookClick={handleBookClick} />
                    </section>
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
                onGenreClick={handleGenreClickFromModal}
                selectedGenres={selectedGenres}
            />
        </div>
    );
}