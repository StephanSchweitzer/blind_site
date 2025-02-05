'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SearchBar } from '@/dernieres-infos/SearchBar';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { CustomPagination } from "@/components/ui/custom-pagination";
import { Tag, Filter } from 'lucide-react';
import type { NewsPost } from '@/types/news';
import { newsTypeLabels, newsTypeColors } from '@/types/news';

export default function DernieresInfoPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [newsPosts, setNewsPosts] = useState<NewsPost[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [, setIsTransitioning] = useState(false);
    const [selectedType, setSelectedType] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchNewsPosts = useCallback(async (page: number) => {
        setIsLoading(true);
        setError(null);

        try {
            const queryParams = new URLSearchParams({
                page: page.toString(),
                limit: '5',
                ...(selectedType !== 'all' && { type: selectedType }),
                ...(searchTerm && { search: searchTerm })
            });

            const response = await fetch(`/api/news?${queryParams}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (!data || !Array.isArray(data.items)) {
                throw new Error('Invalid response format');
            }

            return data;
        } catch (error) {
            console.error('Error fetching news posts:', error);
            setError(error instanceof Error ? error.message : 'An error occurred while fetching news');
            return {
                items: [],
                totalPages: 0,
                currentPage: page,
                totalItems: 0
            };
        } finally {
            setIsLoading(false);
        }
    }, [selectedType, searchTerm]);

    useEffect(() => {
        const loadPage = async () => {
            setIsTransitioning(true);
            const data = await fetchNewsPosts(currentPage);
            if (data) {
                setNewsPosts(data.items);
                setTotalPages(data.totalPages);
                setIsTransitioning(false);
                if (currentPage !== 1) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        };

        loadPage();
    }, [currentPage, fetchNewsPosts]);

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        setCurrentPage(1);
    };

    const handleTypeChange = (type: string) => {
        setSelectedType(type);
        setCurrentPage(1);
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
                        <h1 className="text-3xl font-bold text-gray-100">
                            Dernières Informations
                        </h1>
                        <p className="text-lg text-gray-300">
                            Restez informé des actualités et des événements
                        </p>
                    </section>

                    <div className="space-y-8">
                        <div className="flex flex-col sm:flex-row gap-4 items-center">
                            <div className="flex-1 w-full">
                                <SearchBar
                                    searchTerm={searchTerm}
                                    onSearchChange={handleSearchChange}
                                    placeholder="Rechercher..."
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className="flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-300 text-gray-800"
                            >
                                <Filter className="w-4 h-4 mr-2 text-gray-600" />
                                Filtres
                            </button>
                        </div>

                        {showFilters && (
                            <div className="bg-gray-700 border-gray-200 rounded-lg p-4 flex flex-wrap gap-4 shadow-lg">
                                <button
                                    onClick={() => handleTypeChange('all')}
                                    className={`px-4 py-2 rounded-full transition-colors duration-300 ${
                                        selectedType === 'all'
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-50 text-gray-800 hover:bg-gray-100'
                                    }`}
                                >
                                    Tous
                                </button>
                                {Object.entries(newsTypeLabels).map(([type, label]) => (
                                    <button
                                        key={type}
                                        onClick={() => handleTypeChange(type)}
                                        className={`px-4 py-2 rounded-full transition-colors duration-300 ${
                                            selectedType === type
                                                ? newsTypeColors[type] + ' text-white'
                                                : 'bg-white text-gray-800 hover:bg-gray-100'
                                        }`}
                                    >
                                        <Tag className="w-4 h-4 inline mr-2" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {isLoading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
                                <p className="mt-4 text-gray-300">Chargement des actualités...</p>
                            </div>
                        ) : error ? (
                            <div className="text-center py-8 bg-red-900/20 rounded-lg">
                                <p className="text-red-400">{error}</p>
                            </div>
                        ) : newsPosts.length === 0 ? (
                            <div className="text-center py-8 bg-gray-700 rounded-lg">
                                <p className="text-gray-300">Aucune actualité trouvée</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {newsPosts.map((post) => (
                                    <article key={post.id} className="bg-gray-900 rounded-lg p-6 shadow-lg">
                                        <div className="flex items-center gap-4 mb-4">
                                            <h2 className="text-xl font-bold text-white">{post.title}</h2>
                                            <span className={`px-3 py-1 rounded-full text-sm ${newsTypeColors[post.type]} ${post.type === 'ANNONCE' ? 'text-gray-900' : 'text-white'}`}>
                        {newsTypeLabels[post.type]}
                    </span>
                                        </div>
                                        <p className="text-gray-300">{post.content}</p>
                                        <div className="mt-4 text-sm text-gray-100">
                                            Par {post.author.name} • {new Date(post.publishedAt).toLocaleDateString('fr-FR')}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <CustomPagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                            />
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}