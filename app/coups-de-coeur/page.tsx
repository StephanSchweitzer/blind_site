'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchBar } from '@/coups-de-coeur/SearchBar';
import { CoupDeCoeurList } from '@/coups-de-coeur/CoupDeCoeurList';
import { BookModal } from '@/components/BookModal';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { CustomPagination } from "@/components/ui/custom-pagination";
import type { Book, CoupDeCoeur, CoupsDeCoeurResponse } from '@/types/coups-de-coeur';
import { PDFButton } from "@/coups-de-coeur/PDFButton";
import { PDFContent } from '@/coups-de-coeur/PDFContent';
import generatePDF from 'react-to-pdf';

export default function CoupsDeCoeurPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [coupsDeCoeur, setCoupsDeCoeur] = useState<CoupDeCoeur[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [isExporting, setIsExporting] = useState(false);
    const pdfContentRef = useRef<HTMLDivElement>(null);
    const isFirstRender = useRef(true);

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
            console.error('Error fetching listes de livres:', error);
            return null;
        }
    }, []);

    useEffect(() => {
        const loadPage = async () => {
            setIsTransitioning(true);
            const data = await fetchCoupsDeCoeur(currentPage);
            if (data) {
                setTimeout(() => {
                    setCoupsDeCoeur(data.items);
                    setTotalPages(data.totalPages);
                    setIsTransitioning(false);
                    setInitialLoadComplete(true);
                    if (!isFirstRender.current) {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                }, 300);
            }
        };

        if (isFirstRender.current) {
            isFirstRender.current = false;
        }

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

    const handleExport = async () => {
        if (!pdfContentRef.current) return;
        setIsExporting(true);
        try {
            await generatePDF(pdfContentRef, {
                filename: `${coupsDeCoeur[0].title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
                page: {
                    margin: 20,
                    format: 'a4'
                }
            });
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleBookClick = (book: Book) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    return (
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                <section className="text-center glass-card-lg p-12 animate-fade-in relative overflow-hidden group">
                    {/* Decorative gradient orbs */}
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
                                ou par courriel à {' '}
                                <a
                                    href="mailto:ecapermanence@gmail.com"
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline font-medium
                                        hover:scale-105 inline-block transition-all duration-300"
                                >
                                    ecapermanence@gmail.com
                                </a>
                            </span>
                        </p>
                    </div>
                </section>

                <div className="space-y-8">
                    <div className="mb-8 animate-fade-in" style={{ animationDelay: '100ms' }}>
                        <SearchBar
                            searchTerm={searchTerm}
                            onSearchChange={handleSearchChange}
                            onResultSelect={handleResultSelect}
                        />
                    </div>

                    {!initialLoadComplete ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative">
                                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-purple-900"></div>
                                <div className="absolute inset-0 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-blue-600 dark:border-t-purple-400"></div>
                            </div>
                            <p className="mt-6 text-gray-700 dark:text-gray-300 font-medium animate-pulse">
                                Chargement des listes de livres...
                            </p>
                        </div>
                    ) : coupsDeCoeur.length === 0 ? (
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
                        <div ref={contentRef}>
                            <CoupDeCoeurList
                                content={coupsDeCoeur}
                                onBookClick={handleBookClick}
                                isTransitioning={isTransitioning}
                            />
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div className="animate-fade-in">
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
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

            {coupsDeCoeur.length > 0 && (
                <>
                    <PDFContent
                        ref={pdfContentRef}
                        content={coupsDeCoeur}
                    />
                    <PDFButton
                        onExport={handleExport}
                        isExporting={isExporting}
                    />
                </>
            )}
        </main>
    );
}