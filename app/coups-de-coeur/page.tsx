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
                <section className="text-center glass-card-lg p-12 group hover:scale-[1.02] transition-transform duration-300">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                        Listes de livres
                    </h1>
                    <p className="text-lg text-gray-700 dark:text-gray-100">
                        A commander au{' '}
                        <span className="whitespace-nowrap">01 88 32 31 47</span> ou 48
                        <br />
                        ou par courriel à {' '}
                        <a href="mailto:ecapermanence@gmail.com"
                           className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline">
                            ecapermanence@gmail.com
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

                    {!initialLoadComplete ? (
                        <div className="text-center py-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
                            <p className="mt-4 text-gray-700 dark:text-gray-300">Chargement des listes de livres...</p>
                        </div>
                    ) : coupsDeCoeur.length === 0 ? (
                        <div className="text-center py-8 glass-card">
                            <p className="text-gray-700 dark:text-gray-300">Aucun résultat trouvé</p>
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
                        <div className="hover:scale-[1.02] transition-transform duration-300">
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