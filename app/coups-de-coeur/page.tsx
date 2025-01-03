'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchBar } from '@/coups-de-coeur/SearchBar';
import { Pagination } from '@/components/ui/custom-pagination';
import { AudioPlayer } from '@/coups-de-coeur/AudioPlayer';
import { BookList } from '@/coups-de-coeur/BookList';
import { BookModal } from '@/components/BookModal';
import FrontendNavbar from "@/components/Frontend-Navbar";
import type { Book, CoupDeCoeur, CoupsDeCoeurResponse } from '@/types/coups-de-coeur';

export default function CoupsDeCoeurPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [coupsDeCoeur, setCoupsDeCoeur] = useState<CoupDeCoeur[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Keep track of previous content
    const [previousContent, setPreviousContent] = useState<CoupDeCoeur[]>([]);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Ref for the content container
    const contentRef = useRef<HTMLDivElement>(null);

    const fetchCoupsDeCoeur = useCallback(async (page: number) => {
        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '1'
            });

            const response = await fetch(`/api/coups-de-coeur?${queryParams.toString()}`);
            const data: CoupsDeCoeurResponse = await response.json();

            return data;
        } catch (error) {
            console.error('Error fetching coups de coeur:', error);
            return null;
        }
    }, []);

    useEffect(() => {
        const loadPage = async () => {
            // Don't show loading state on subsequent page loads
            if (!isLoading) {
                setIsTransitioning(true);
                setPreviousContent(coupsDeCoeur);
            }

            const data = await fetchCoupsDeCoeur(currentPage);

            if (data) {
                // Slight delay to allow for fade transition
                setTimeout(() => {
                    setCoupsDeCoeur(data.items);
                    setTotalPages(data.totalPages);
                    setIsLoading(false);
                    setIsTransitioning(false);

                    // Smooth scroll after content has updated
                    if (!isLoading) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }, 150);
            }
        };

        loadPage();
    }, [currentPage, fetchCoupsDeCoeur]);

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
    };

    const handleResultSelect = async (id: number) => {
        try {
            const response = await fetch(`/api/coups-de-coeur/position?id=${id}`);
            if (response.ok) {
                const { page } = await response.json();
                setCurrentPage(page);
            }
        } catch (error) {
            console.error('Error finding coup de coeur position:', error);
        }
    };

    const handleBookClick = (book: Book) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    const handlePageChange = (page: number) => {
        if (page !== currentPage) {
            setCurrentPage(page);
        }
    };

    const renderContent = (content: CoupDeCoeur[]) => {
        if (!content.length) return null;
        return (
            <div className="bg-gray-700 rounded-lg shadow-lg overflow-hidden">
                <div className="p-6">
                    <h2 className="text-2xl font-bold mb-4 text-gray-100">
                        {content[0].title}
                    </h2>

                    <div className="mb-6">
                        <AudioPlayer
                            src={content[0].audioPath}
                            title={content[0].title}
                        />
                    </div>

                    <p className="mb-6 text-gray-300 leading-relaxed">
                        {content[0].description}
                    </p>

                    <BookList
                        books={content[0].books}
                        onBookClick={handleBookClick}
                    />
                </div>
            </div>
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
                        <h1 className="text-3xl font-bold text-gray-100">Coups de coeur</h1>
                        <p className="text-lg text-gray-300">
                            A commander au{' '}
                            <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                            <br />
                            ou par courriel à{' '}
                            <a href="mailto:lecteurs.eca@gmail.com" className="text-blue-400 hover:text-blue-300">
                                lecteurs.eca@gmail.com
                            </a>
                        </p>
                    </section>

                    <div className="space-y-8">
                        <div className="mb-8">
                            <SearchBar
                                searchTerm={searchTerm}
                                onSearchChange={handleSearchChange}
                                onResultSelect={handleResultSelect}
                            />
                        </div>

                        {isLoading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
                                <p className="mt-4 text-gray-300">Chargement des Coups des Cœurs ...</p>
                            </div>
                        ) : coupsDeCoeur.length === 0 ? (
                            <div className="text-center py-8 bg-gray-700 rounded-lg">
                                <p className="text-gray-300">Aucun résultat trouvé</p>
                            </div>
                        ) : (
                            <div ref={contentRef} className="relative">
                                {/* Previous content with fade-out effect */}
                                {isTransitioning && previousContent.length > 0 && (
                                    <div className="absolute inset-0 transition-opacity duration-150 ease-out opacity-0">
                                        {renderContent(previousContent)}
                                    </div>
                                )}

                                {/* Current content with fade-in effect */}
                                <div className={`transition-opacity duration-150 ease-in ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                                    {renderContent(coupsDeCoeur)}
                                </div>
                            </div>
                        )}

                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />

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