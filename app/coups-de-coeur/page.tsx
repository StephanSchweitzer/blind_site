'use client';

import React, { useState, useEffect } from 'react';
import { SearchBar } from '@/coups-de-coeur/SearchBar';
import { Pagination } from '@/coups-de-coeur/Pagination';
import { AudioPlayer } from '@/coups-de-coeur/AudioPlayer';
import { BookList } from '@/coups-de-coeur/BookList';
import { BookModal } from '@/components/BookModal';
import type { Book, CoupDeCoeur, CoupsDeCoeurResponse } from '@/types/coups-de-coeur';

export default function CoupsDeCoeurPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [coupsDeCoeur, setCoupsDeCoeur] = useState<CoupDeCoeur[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Only fetch on mount and page changes, not on search changes
    useEffect(() => {
        const fetchCoupsDeCoeur = async () => {
            setIsLoading(true);
            try {
                const queryParams = new URLSearchParams({
                    page: currentPage.toString(),
                    limit: '1'
                });

                const response = await fetch(`/api/coups-de-coeur?${queryParams.toString()}`);
                const data: CoupsDeCoeurResponse = await response.json();

                setCoupsDeCoeur(data.items);
                setTotalPages(data.totalPages);
            } catch (error) {
                console.error('Error fetching coups de coeur:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCoupsDeCoeur();
    }, [currentPage]);

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        // No longer triggers a fetch
    };

    const handleResultSelect = async (id: number) => {
        try {
            const response = await fetch(`/api/coups-de-coeur/position?id=${id}`);
            if (response.ok) {
                const { page } = await response.json();
                setCurrentPage(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
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
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold text-center mb-4">Coups de coeur</h1>

            <p className="text-center mb-8">
                A commander au 01 88 32 31 47 ou 48 ou par courriel à{' '}
                <a href="mailto:lecteurs.eca@gmail.com" className="text-blue-600 hover:text-blue-800">
                    lecteurs.eca@gmail.com
                </a>
            </p>

            <div className="mb-8">
                <SearchBar
                    searchTerm={searchTerm}
                    onSearchChange={handleSearchChange}
                    onResultSelect={handleResultSelect}
                />
            </div>

            {isLoading ? (
                <div className="text-center py-8">Chargement...</div>
            ) : coupsDeCoeur.length === 0 ? (
                <div className="text-center py-8">Aucun résultat trouvé</div>
            ) : (
                <>
                    <div className="mb-12 p-6 bg-white rounded-lg shadow">
                        <h2 className="text-2xl font-bold mb-4">{coupsDeCoeur[0].title}</h2>

                        <AudioPlayer
                            src={coupsDeCoeur[0].audioPath}
                            title={coupsDeCoeur[0].title}
                        />

                        <p className="mb-6 text-gray-700">{coupsDeCoeur[0].description}</p>

                        <BookList
                            books={coupsDeCoeur[0].books}
                            onBookClick={handleBookClick}
                        />
                    </div>

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
                </>
            )}
        </div>
    );
}