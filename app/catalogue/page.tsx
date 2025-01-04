'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchBar } from '@/catalogue/search/SearchBar';
import { BookList } from '@/catalogue/search/BookList';
import { BookModal } from '@/components/BookModal';
import { CustomPagination } from "@/components/ui/custom-pagination";
import { Book } from '@prisma/client';
import FrontendNavbar from "@/components/Frontend-Navbar";

const ITEMS_PER_PAGE = 9;

interface BookWithGenres extends Book {
    genres: {
        genre: {
            id: number;
            name: string;
        };
    }[];
}

export default function BooksPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [books, setBooks] = useState<BookWithGenres[]>([]);
    const [totalBooks, setTotalBooks] = useState<number | null>(null);
    const [totalPages, setTotalPages] = useState(1);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [selectedBook, setSelectedBook] = useState<BookWithGenres | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [availableGenres, setAvailableGenres] = useState<{ id: number; name: string; }[]>([]);

    // New states for transitions
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [previousBooks, setPreviousBooks] = useState<BookWithGenres[]>([]);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const response = await fetch('/api/genres');
                const data = await response.json();
                setAvailableGenres(data);
            } catch (error) {
                console.error('Error fetching genres:', error);
            }
        };
        fetchGenres();
    }, []);

    const fetchBooks = useCallback(async () => {
        try {
            const queryParams = new URLSearchParams({
                search: searchTerm,
                filter: selectedFilter,
                page: currentPage.toString(),
                limit: ITEMS_PER_PAGE.toString(),
            });

            if (selectedGenres.length > 0) {
                selectedGenres.forEach(genreId => {
                    queryParams.append('genres', genreId.toString());
                });
            }

            const response = await fetch(`/api/books?${queryParams.toString()}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching books:', error);
            return null;
        }
    }, [searchTerm, selectedFilter, currentPage, selectedGenres]);

    useEffect(() => {
        const loadBooks = async () => {
            // Start transition if this is not the initial load
            if (books.length > 0) {
                setIsTransitioning(true);
                setPreviousBooks(books);
            }

            const data = await fetchBooks();

            if (data) {
                // Slight delay to allow for fade transition
                setTimeout(() => {
                    setBooks(data.books);
                    setTotalBooks(data.total);
                    setTotalPages(Math.ceil(data.total / ITEMS_PER_PAGE));
                    setIsTransitioning(false);
                    setIsInitialLoading(false);

                    // Custom smooth scroll after content has updated
                    if (books.length > 0) {
                        const scrollToTop = () => {
                            const currentPosition = window.pageYOffset;
                            if (currentPosition > 0) {
                                window.requestAnimationFrame(() => {
                                    // Slower, smoother scroll - move 15% of remaining distance per frame
                                    window.scrollTo(0, currentPosition * 0.85);
                                    if (currentPosition * 0.85 > 1) {
                                        scrollToTop();
                                    } else {
                                        window.scrollTo(0, 0);
                                    }
                                });
                            }
                        };
                        scrollToTop();
                    }
                }, 150);
            }
        };

        loadBooks();
    }, [fetchBooks]);

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(1);
    };

    const handleFilterChange = (filter: string) => {
        setSelectedFilter(filter);
        setCurrentPage(1);
    };

    const handleGenreChange = (genres: number[]) => {
        setSelectedGenres(genres);
        setCurrentPage(1);
    };

    const handleBookClick = (book: BookWithGenres) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    const renderBookList = (books: BookWithGenres[]) => {
        return (
            <BookList books={books} onBookClick={handleBookClick} />
        );
    };

    return (
        <main className="min-h-screen relative bg-gray-900">
            <div className="hidden lg:block fixed inset-y-0 w-full">
                <div className="h-full max-w-6xl mx-auto">
                    <div className="h-full flex">
                        <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-800"></div>
                        <div className="flex-1"></div>
                        <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-800"></div>
                    </div>
                </div>
            </div>

            <div className="relative">
                <FrontendNavbar />

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8 bg-gray-800">
                    <section className="text-center space-y-4">
                        <h1 className="text-3xl font-bold text-gray-100">Catalogue des livres</h1>
                        <p className="text-lg text-gray-300">
                            <span className="font-semibold">
                                {totalBooks === null ? 'Chargement du catalogue...' : `${totalBooks} titres au catalogue !`}
                            </span>
                            <br />
                            Consultez-nous si vous avez une recherche particulière,
                            et commandez au <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                            <br />
                            ou par courriel à{' '}
                            <a href="mailto:ass.eca@wanadoo.fr" className="text-blue-400 hover:text-blue-300">
                                ass.eca@wanadoo.fr
                            </a>{' '}
                            ou{' '}
                            <a href="mailto:lecteurs.eca@orange.fr" className="text-blue-400 hover:text-blue-300">
                                lecteurs.eca@orange.fr
                            </a>
                        </p>
                    </section>

                    <div className="space-y-8">
                        <SearchBar
                            searchTerm={searchTerm}
                            onSearchChange={handleSearchChange}
                            selectedFilter={selectedFilter}
                            onFilterChange={handleFilterChange}
                            selectedGenres={selectedGenres}
                            onGenreChange={handleGenreChange}
                            availableGenres={availableGenres}
                        />

                        <div ref={contentRef} className="relative min-h-[200px]">
                            {isInitialLoading ? (
                                <div className="flex flex-col items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                                    <p className="mt-4 text-gray-300">Chargement des livres...</p>
                                </div>
                            ) : books.length === 0 ? (
                                <div className="text-center py-8 bg-gray-700 rounded-lg">
                                    <p className="text-gray-300">Aucun résultat trouvé</p>
                                </div>
                            ) : (
                                <>
                                    {/* Previous content with fade-out effect */}
                                    {isTransitioning && previousBooks.length > 0 && (
                                        <div className="absolute inset-0 transition-opacity duration-150 ease-out opacity-0">
                                            {renderBookList(previousBooks)}
                                        </div>
                                    )}

                                    {/* Current content with fade-in effect */}
                                    <div className={`transition-opacity duration-150 ease-in ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                                        {renderBookList(books)}
                                    </div>
                                </>
                            )}
                        </div>

                        {totalPages > 1 && (
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        )}

                        <BookModal
                            book={selectedBook}
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}