'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SearchBar } from '@/catalogue/search/SearchBar';
import { BookList } from '@/catalogue/search/BookList';
import { BookModal } from '@/components/BookModal';
import { PublicPaginatedList } from '@/components/ui/public-pagination';
import { SearchResult } from '@/types/book';
import type { PublicBook } from '@/lib/books/publicBook';
import { BookSearchSuggestions } from '@/components/ui/book-search-suggestions';
import type { BookSearchSuggestion, CatalogueFilterKey } from '@/lib/books/book-suggestion-types';
import { outOfRangePage, pageInfo, parsePageParam } from '@/lib/pagination';
import { useListUrl } from '@/hooks/useListUrl';

/** The « Rechercher dans » options, as the search bar words them. */
const SEARCH_FIELD_LABELS: Record<string, string> = {
    title: 'Titre',
    author: 'Auteur',
    description: 'Description',
    genre: 'Genre',
};

const ITEMS_PER_PAGE = 9;
const DEBOUNCE_DELAY = 300;

type CatalogueQuery = { search: string; filter: string; genres: number[]; page: number };

/**
 * The catalogue's state as a query string — the same parameters as the admin
 * catalogue (search, filter, genres=1,2, page), so a link reads the same on
 * both sides. Defaults are left out: the bare /catalogue is page 1 of everything.
 */
function catalogueParams(q: CatalogueQuery): URLSearchParams {
    const params = new URLSearchParams();
    if (q.search) params.set('search', q.search);
    if (q.filter !== 'all') params.set('filter', q.filter);
    if (q.genres.length > 0) params.set('genres', q.genres.join(','));
    if (q.page > 1) params.set('page', String(q.page));
    return params;
}

/** A shared link is outside input: an unknown field or genre falls back to « all ». */
function parseCatalogueParams(params: URLSearchParams, genreIds: Set<number>): CatalogueQuery {
    const filter = params.get('filter') ?? 'all';
    return {
        search: params.get('search') ?? '',
        filter: Object.prototype.hasOwnProperty.call(SEARCH_FIELD_LABELS, filter) ? filter : 'all',
        genres: (params.get('genres') ?? '')
            .split(',')
            .map(Number)
            .filter((id) => genreIds.has(id)),
        page: parsePageParam(params.get('page')),
    };
}

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

    // Search, field, genres and page live in the URL (hooks/useListUrl.ts).
    // A link that carries a search opens on the cached first page, so mark the
    // list as loading straight away rather than showing « 1–9 sur 15 428 » and
    // then swapping.
    const writeUrl = useListUrl((params) => {
        const next = parseCatalogueParams(params, new Set(genres.map((g) => g.id)));
        const current = { search: searchTerm, filter: selectedFilter, genres: selectedGenres, page: currentPage };
        if (catalogueParams(next).toString() === catalogueParams(current).toString()) return;
        setSearchTerm(next.search);
        setSelectedFilter(next.filter);
        setSelectedGenres(next.genres);
        setCurrentPage(next.page);
        setIsSearching(true);
    });

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

        writeUrl(catalogueParams({ search: term, filter, genres: genreIds, page }));

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

            const data: SearchResult = await response.json();
            if (abortControllerRef.current !== abortController) return;
            // A link to page 40 that outlived the books behind it: go to the
            // last page, replacing the entry — kept, it would lead back here.
            const lastPage = outOfRangePage(pageInfo(page, ITEMS_PER_PAGE, data.total), data.books.length);
            if (lastPage) {
                writeUrl(catalogueParams({ search: term, filter, genres: genreIds, page: lastPage }), { replace: true });
                setCurrentPage(lastPage);
                return;
            }
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
    }, [initialBooks, initialTotalBooks, initialTotalPages, writeUrl]);

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
                no feedback at all that anything happened (RGAA 7.4) — the count
                above the list is that region (components/ui/public-pagination.tsx). */}
            <PublicPaginatedList
                info={pageInfo(currentPage, ITEMS_PER_PAGE, searchResults.total)}
                noun={{ one: 'livre', many: 'livres' }}
                label="Pages du catalogue"
                onPageChange={setCurrentPage}
                pending={isSearching}
                announce={
                    isSearching
                        ? 'Recherche en cours…'
                        : searchResults.total === 0
                            ? (searchResults.searchSuggestions?.length
                                ? 'Aucun livre ne correspond à votre recherche. Des suggestions sont proposées ci-dessous.'
                                : 'Aucun livre ne correspond à votre recherche.')
                            : undefined
                }
            >
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
            </PublicPaginatedList>

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