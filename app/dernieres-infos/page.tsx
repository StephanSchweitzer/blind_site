'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SearchBar } from '@/dernieres-infos/SearchBar';
import FrontendNavbar from "@/components/Frontend-Navbar";
import { CustomPagination } from "@/components/ui/custom-pagination";
import { Tag, Filter, User, Calendar } from 'lucide-react';
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
        <main className="min-h-screen relative">
            <FrontendNavbar />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-8">
                <section className="text-center glass-card-lg p-12 animate-fade-in relative overflow-hidden group">
                    {/* Decorative gradient orbs */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 dark:bg-purple-500/20 rounded-full blur-3xl animate-blob"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400/20 dark:bg-blue-500/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>

                    <div className="relative z-10">
                        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
                            Dernières Informations
                        </h1>
                        <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-400 rounded-full mx-auto mb-6"></div>
                        <p className="text-lg text-gray-700 dark:text-gray-100">
                            Restez informé des actualités et des événements
                        </p>
                    </div>
                </section>

                <div className="space-y-8">
                    <div className="flex flex-col sm:flex-row gap-4 items-center animate-fade-in" style={{ animationDelay: '100ms' }}>
                        <div className="flex-1 w-full">
                            <SearchBar
                                searchTerm={searchTerm}
                                onSearchChange={handleSearchChange}
                                placeholder="Rechercher..."
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-5 py-3
                                bg-white/95 dark:bg-gray-700/95
                                backdrop-blur-xl
                                border-2 border-gray-300/50 dark:border-gray-600/50
                                rounded-xl
                                text-gray-900 dark:text-gray-100
                                font-medium
                                hover:bg-white dark:hover:bg-gray-700
                                hover:border-blue-500/50 dark:hover:border-purple-500/50
                                shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]
                                hover:shadow-[0_12px_40px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_12px_40px_rgb(0,0,0,0.4)]
                                transition-all duration-300"
                        >
                            <Filter className="w-4 h-4" />
                            Filtres
                            <span className={`transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </span>
                        </button>
                    </div>

                    {showFilters && (
                        <div className="glass-card p-5 flex flex-wrap gap-3 animate-fade-in">
                            <button
                                onClick={() => handleTypeChange('all')}
                                className={`px-4 py-2.5 rounded-full font-medium transition-all duration-300 shadow-md
                                    ${selectedType === 'all'
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-purple-600 text-white shadow-blue-500/30 scale-105'
                                    : 'bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600/50 hover:scale-105'
                                }`}
                            >
                                Tous
                            </button>
                            {Object.entries(newsTypeLabels).map(([type, label]) => (
                                <button
                                    key={type}
                                    onClick={() => handleTypeChange(type)}
                                    className={`px-4 py-2.5 rounded-full font-medium transition-all duration-300 shadow-md flex items-center gap-2
                                        ${selectedType === type
                                        ? newsTypeColors[type] + ' text-white scale-105'
                                        : 'bg-gray-100 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600/50 hover:scale-105'
                                    }`}
                                >
                                    <Tag className="w-4 h-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative">
                                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-purple-900"></div>
                                <div className="absolute inset-0 animate-spin rounded-full h-16 w-16 border-4 border-transparent border-t-blue-600 dark:border-t-purple-400"></div>
                            </div>
                            <p className="mt-6 text-gray-700 dark:text-gray-300 font-medium animate-pulse">
                                Chargement des actualités...
                            </p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12 rounded-2xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 animate-fade-in">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-red-700 dark:text-red-400 font-medium">{error}</p>
                        </div>
                    ) : newsPosts.length === 0 ? (
                        <div className="text-center py-12 glass-card animate-fade-in">
                            <div className="max-w-md mx-auto">
                                <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                                    </svg>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 font-medium">Aucune actualité trouvée</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {newsPosts.map((post, index) => (
                                <article
                                    key={post.id}
                                    className="glass-card p-6 hover:scale-[1.01] transition-all duration-300 animate-fade-in-up group"
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="flex items-start gap-4 mb-4 flex-wrap">
                                        <div className="flex-1">
                                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors duration-300">
                                                {post.title}
                                            </h2>
                                        </div>
                                        <span className={`
                                            px-4 py-1.5 rounded-full text-sm font-semibold shadow-md
                                            ${newsTypeColors[post.type]} 
                                            ${post.type === 'ANNONCE' ? 'text-gray-900' : 'text-white'}
                                            transition-transform duration-300 group-hover:scale-105
                                        `}>
                                            {newsTypeLabels[post.type]}
                                        </span>
                                    </div>

                                    <div className="mb-4 p-4 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30">
                                        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                                            {post.content}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <User className="w-4 h-4" />
                                            <span className="font-medium">{post.author.name}</span>
                                        </div>
                                        <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="w-4 h-4" />
                                            <span>{new Date(post.publishedAt).toLocaleDateString('fr-FR')}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
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
                </div>
            </div>
        </main>
    );
}