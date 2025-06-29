'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebounce } from 'use-debounce';
import { useEffect, useState, useCallback } from 'react';
import { NewsType, newsTypeLabels } from '@/types/news';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Article = {
    id: number;
    title: string;
    publishedAt: Date;
    type: NewsType;
    author: {
        name: string | null;
    } | null;
};

interface ArticlesTableProps {
    initialArticles: Article[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function ArticlesTable({
                                  initialArticles,
                                  initialPage = 1,
                                  initialSearch = '',
                                  totalPages = 1
                              }: ArticlesTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch] = useDebounce(search, 300);

    // Get current page from URL, defaulting to initialPage if invalid
    const currentPage = Math.max(1, parseInt(searchParams.get('page') || initialPage.toString()));

    // Handle search input changes with improved logic
    useEffect(() => {
        const searchFromUrl = searchParams.get('search') || '';
        setSearch(searchFromUrl);
    }, [searchParams]);

    // Handle debounced search with navigation
    useEffect(() => {
        const currentSearch = searchParams.get('search') || '';
        if (debouncedSearch !== currentSearch) {
            const params = new URLSearchParams(searchParams);
            if (debouncedSearch.trim()) {
                params.set('search', debouncedSearch);
            } else {
                params.delete('search');
            }
            params.set('page', '1'); // Reset to first page on search
            router.push(`?${params.toString()}`, { scroll: false });
        }
    }, [debouncedSearch, router, searchParams]);

    // Improved page change handler
    const handlePageChange = useCallback((newPage: number) => {
        if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;

        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`, { scroll: false });
    }, [currentPage, totalPages, searchParams, router]);

    // Navigate to article edit page
    const navigateToArticle = useCallback((articleId: number) => {
        router.push(`/admin/news/${articleId}`);
    }, [router]);

    // Handle article row click
    const handleRowClick = useCallback((articleId: number) => {
        navigateToArticle(articleId);
    }, [navigateToArticle]);

    // Handle edit button click with event propagation stop
    const handleEditClick = useCallback((e: React.MouseEvent, articleId: number) => {
        e.stopPropagation();
        navigateToArticle(articleId);
    }, [navigateToArticle]);

    // Generate pagination buttons with improved UX
    const generatePaginationButtons = () => {
        const buttons = [];
        const maxVisiblePages = 5;

        // Previous button
        buttons.push(
            <Button
                key="prev"
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700 disabled:opacity-50"
                onClick={() => handlePageChange(currentPage - 1)}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
        );

        // Page number buttons
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        // Adjust start if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page and ellipsis
        if (startPage > 1) {
            buttons.push(
                <Button
                    key={1}
                    variant="outline"
                    size="sm"
                    className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                    onClick={() => handlePageChange(1)}
                >
                    1
                </Button>
            );
            if (startPage > 2) {
                buttons.push(
                    <span key="ellipsis1" className="text-gray-400 px-2">...</span>
                );
            }
        }

        // Main page buttons
        for (let i = startPage; i <= endPage; i++) {
            buttons.push(
                <Button
                    key={i}
                    variant={currentPage === i ? "default" : "outline"}
                    size="sm"
                    className={currentPage === i
                        ? "bg-white text-gray-900 hover:bg-gray-100"
                        : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                    onClick={() => handlePageChange(i)}
                >
                    {i}
                </Button>
            );
        }

        // Last page and ellipsis
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                buttons.push(
                    <span key="ellipsis2" className="text-gray-400 px-2">...</span>
                );
            }
            buttons.push(
                <Button
                    key={totalPages}
                    variant="outline"
                    size="sm"
                    className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                    onClick={() => handlePageChange(totalPages)}
                >
                    {totalPages}
                </Button>
            );
        }

        // Next button
        buttons.push(
            <Button
                key="next"
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700 disabled:opacity-50"
                onClick={() => handlePageChange(currentPage + 1)}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
        );

        return buttons;
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                <div>
                    <CardTitle className="text-gray-100">Gérer les dernières info</CardTitle>
                    <CardDescription className="text-gray-400">
                        Gérer et modifier les informations affichées sur dernières info
                    </CardDescription>
                </div>
                <Link href="/admin/news/new">
                    <Button className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500">
                        Ajouter un info
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Rechercher les dernières infos..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-sm bg-white text-gray-900 placeholder:text-gray-500"
                    />
                    {search && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearch('')}
                            className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        >
                            Effacer
                        </Button>
                    )}
                </div>

                <div className="rounded-md border border-gray-700 bg-gray-800">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-700 bg-gray-800">
                                <TableHead className="text-gray-200 font-medium">Titre</TableHead>
                                <TableHead className="text-gray-200 font-medium">Type</TableHead>
                                <TableHead className="text-gray-200 font-medium">Auteur</TableHead>
                                <TableHead className="text-gray-200 font-medium">Date de Publication</TableHead>
                                <TableHead className="text-gray-200 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialArticles.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                                        {search ? 'Aucun article trouvé pour cette recherche' : 'Aucun article trouvé'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialArticles.map((article) => (
                                    <TableRow
                                        key={article.id}
                                        className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer transition-colors"
                                        onClick={() => handleRowClick(article.id)}
                                    >
                                        <TableCell className="text-gray-200 font-medium">
                                            {article.title}
                                        </TableCell>
                                        <TableCell>
                                            <span className="px-2 py-1 rounded-full text-sm font-medium text-white bg-gray-600">
                                                {newsTypeLabels[article.type]}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-gray-200">
                                            {article.author?.name || 'Inconnu'}
                                        </TableCell>
                                        <TableCell className="text-gray-200">
                                            {new Date(article.publishedAt).toLocaleDateString('fr-FR', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600 transition-colors"
                                                onClick={(e) => handleEditClick(e, article.id)}
                                            >
                                                Modifier
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {totalPages > 1 && (
                    <div className="mt-6">
                        <div className="flex justify-center items-center gap-1">
                            {generatePaginationButtons()}
                        </div>
                        <p className="text-center text-sm text-gray-400 mt-2">
                            Page {currentPage} sur {totalPages} ({initialArticles.length} article{initialArticles.length !== 1 ? 's' : ''})
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}