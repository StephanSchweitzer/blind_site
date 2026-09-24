'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from '@/listes-de-livres/SearchBar';
import { CoupDeCoeurList } from '@/listes-de-livres/CoupDeCoeurList';
import { BookModal } from '@/components/BookModal';
import FrontendNavbar from '@/components/Frontend-Navbar';
import { CustomPagination } from '@/components/ui/custom-pagination';
import { PDFButton } from '@/listes-de-livres/PDFButton';
import type { CoupDeCoeur } from '@/types/coups-de-coeur';
import type { PublicBook } from '@/lib/books/publicBook';
import { PageHeader } from "@/components/PageHeader";

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
    const [selectedBook, setSelectedBook] = useState<PublicBook | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
    }, [currentPage]);

    const goToPage = (page: number) => {
        startTransition(() => {
            router.push(`?page=${page}`, { scroll: false });
        });
    };

    const handleResultSelect = async (id: number) => {
        try {
            const response = await fetch(`/api/listes-de-livres/position?id=${id}`);
            if (response.ok) {
                const { page } = await response.json();
                goToPage(page);
            }
        } catch (error) {
            console.error('Error finding coup de coeur position:', error);
        }
    };

    const handleBookClick = (book: PublicBook) => {
        setSelectedBook(book);
        setIsModalOpen(true);
    };

    return (
        <div className="flex min-h-screen flex-col">
            <FrontendNavbar />
        <main id="contenu-principal" className="relative flex-1">

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
                <PageHeader title="Listes de livres">
                    <p>
                        À demander au{' '}
                        {/* Both numbers in full and as tel: links: « ou 48 », read aloud
                            or tapped, leads nowhere. */}
                        <a href="tel:+33188323147" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 47</a>{' '}
                        ou{' '}
                        <a href="tel:+33188323148" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">01 88 32 31 48</a>{' '}
                        ou par courriel à{' '}
                        <a href="mailto:ecapermanence@gmail.com" className="font-semibold whitespace-nowrap text-primary dark:text-blue-300 underline underline-offset-2">ecapermanence@gmail.com</a>
                    </p>
                </PageHeader>

                <div className="space-y-8">
                    <div className="mb-8" style={{ animationDelay: '100ms' }}>
                        <SearchBar
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            onResultSelect={handleResultSelect}
                        />
                    </div>

                    {totalPages > 1 && (
                        <div className="">
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={goToPage}
                                label="Pagination (haut de page)"
                            />
                        </div>
                    )}

                    {content.length === 0 ? (
                        <div className="text-center py-12 glass-card">
                            <div className="max-w-md mx-auto">
                                <div aria-hidden="true" className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg aria-hidden="true" focusable="false" className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <div className="">
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={goToPage}
                                label="Pagination (bas de page)"
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
        </div>
    );
}