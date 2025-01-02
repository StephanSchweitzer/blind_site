'use client';

import React, { useState, useEffect } from 'react';
import { SearchBar } from '@/catalogue/search/SearchBar';
import { BookList } from '@/catalogue/search/BookList';
import { Pagination } from '@/catalogue/search/Pagination';
import { BookModal } from '@/components/BookModal';
import { Book } from '@prisma/client';
import FrontendNavbar from "@/components/Frontend-Navbar";

const ITEMS_PER_PAGE = 9;

// Define the BookWithGenres type at the page level
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
    const [books, setBooks] = useState<BookWithGenres[]>([]);  // Updated type
    const [totalPages, setTotalPages] = useState(1);
    const [selectedBook, setSelectedBook] = useState<BookWithGenres | null>(null);  // Updated type
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [availableGenres, setAvailableGenres] = useState<{ id: number; name: string; }[]>([]);

    useEffect(() => {
        // Fetch available genres when component mounts
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

    useEffect(() => {
        fetchBooks();
    }, [searchTerm, selectedFilter, currentPage, selectedGenres]);

    const fetchBooks = async () => {
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
            setBooks(data.books);  // API response includes genres
            setTotalPages(Math.ceil(data.total / ITEMS_PER_PAGE));
        } catch (error) {
            console.error('Error fetching books:', error);
        }
    };

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

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const handleBookClick = (book: BookWithGenres) => {  // Updated type
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    return (
        <main className="min-h-screen relative">
            <div className="hidden lg:block fixed inset-y-0 w-full">
                <div className="h-full max-w-6xl mx-auto">
                    <div className="h-full flex">
                        <div className="w-16 h-full bg-gradient-to-r from-transparent to-gray-100"></div>
                        <div className="flex-1"></div>
                        <div className="w-16 h-full bg-gradient-to-l from-transparent to-gray-100"></div>
                    </div>
                </div>
            </div>

            <div className="relative">
                <FrontendNavbar />

                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8 bg-white">
                    <section className="text-center space-y-4">
                        <h1 className="text-3xl font-bold">Catalogue des livres</h1>
                        <p className="text-lg text-gray-700">
                            <span className="font-semibold">{books.length} titres au catalogue!</span>
                            <br />
                            Consultez-nous si vous avez une recherche particulière,
                            et commandez au <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                            <br />
                            ou par courriel à{' '}
                            <a href="mailto:ass.eca@wanadoo.fr" className="text-blue-600 hover:text-blue-800">
                                ass.eca@wanadoo.fr
                            </a>{' '}
                            ou{' '}
                            <a href="mailto:lecteurs.eca@orange.fr" className="text-blue-600 hover:text-blue-800">
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

                        <BookList books={books} onBookClick={handleBookClick} />

                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    </div>

                    <BookModal
                        book={selectedBook}
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                    />
                </div>
            </div>
        </main>
    );
}