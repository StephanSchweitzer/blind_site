'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from '@/coups-de-coeur/SearchBar';
import { CoupDeCoeurList } from '@/coups-de-coeur/CoupDeCoeurList';
import { BookModal } from '@/components/BookModal';
import FrontendNavbar from '@/components/Frontend-Navbar';
import { CustomPagination } from '@/components/ui/custom-pagination';
import { PDFButton } from '@/coups-de-coeur/PDFButton';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { BookWithGenres } from '@/types/book';

interface CoupsDeCoeurClientProps {
    content: CoupDeCoeur[];
    currentPage: number;
    totalPages: number;
}

export default function CoupsDeCoeurClient({
                                               content,
                                               currentPage,
                                               totalPages,
                                           }: CoupsDeCoeurClientProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBook, setSelectedBook] = useState<BookWithGenres | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentPage]);

    const goToPage = (page: number) => {
        startTransition(() => {
            router.push(`?page=${page}`, { scroll: false });
        });
    };

    const handleResultSelect = async (id: number) => {
        try {
            const response = await fetch(`/api/coups-de-coeur/position?id=${id}`);
            if (response.ok) {
                const { page } = await response.json();
                goToPage(page);
            }
        } catch (error) {
            console.error('Error finding coup de coeur position:', error);
        }
    };

    const handleBookClick = (book: BookWithGenres) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                <section className="text-center glass-card-lg p-12 animate-fade-in relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 dark:bg-purple-500/20 rounded-full blur-3xl animate-blob"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/20 dark:bg-blue-500/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>

                    <div className="relative z-10">
                        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                            Listes de livres
                        </h1>
                        <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-400 rounded-full mx-auto mb-6"></div>
                        <p className="text-lg text-gray-700 dark:text-gray-100 leading-relaxed max-w-2xl mx-auto">
                            <span className="text-base">
                                A commander au{' '}
                                <span className="font-semibold whitespace-nowrap">01 88 32 31 47</span> ou 48
                            </span>
                            <br />
                            <span className="text-base">
                                ou par courriel à{' '}
                                <a
                                    href="mailto:ecapermanence@gmail.com"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium hover:scale-105 inline-block transition-all duration-300"
                                >
                                    ecapermanence@gmail.com
                                </a>
                            </span>
                        </p>
                    </div>
                </section>

                <div className="space-y-8">
                    <div className="mb-8" style={{ animationDelay: '100ms' }}>
                        <SearchBar
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            onResultSelect={handleResultSelect}
                        />
                    </div>

                    {totalPages > 1 && (
                        <div className="animate-fade-in">
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={goToPage}
                            />
                        </div>
                    )}

                    {content.length === 0 ? (
                        <div className="text-center py-12 glass-card animate-fade-in">
                            <div className="max-w-md mx-auto">
                                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 font-medium">Aucun résultat trouvé</p>
                            </div>
                        </div>
                    ) : (
                        <CoupDeCoeurList
                            content={content}
                            onBookClick={handleBookClick}
                            isTransitioning={isPending}
                        />
                    )}

                    {totalPages > 1 && (
                        <div className="animate-fade-in">
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={goToPage}
                            />
                        </div>
                    )}

                    <BookModal
                        book={selectedBook}
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                    />
                </div>
            </div>

            {content.length > 0 && (
                <PDFButton content={content} />
            )}
        </main>
    );
}