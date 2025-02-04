// components/ArticlesTable.tsx
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
import { useEffect, useState } from 'react';
import { NewsType, newsTypeLabels } from '@/types/news';  // Update this import

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
                                  initialSearch = '',
                                  totalPages = 1
                              }: ArticlesTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch] = useDebounce(search, 300);

    // Get current page from URL, defaulting to 1 if invalid
    const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1'));

    // Update search when URL changes
    useEffect(() => {
        const searchFromUrl = searchParams.get('search') || '';
        if (searchFromUrl !== search) {
            setSearch(searchFromUrl);
        }
    }, [searchParams, search]);

    // Handle search input changes
    useEffect(() => {
        if (debouncedSearch !== searchParams.get('search')) {
            const params = new URLSearchParams(searchParams);
            if (debouncedSearch.trim()) {
                params.set('search', debouncedSearch);
            } else {
                params.delete('search');
            }
            params.set('page', '1'); // Reset to first page on search
            router.push(`?${params.toString()}`);
        }
    }, [debouncedSearch, router, searchParams]);

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;

        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
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
                                        Aucun article trouvé
                                    </TableCell>
                                </TableRow>
                            ) : (
                                initialArticles.map((article) => (
                                    <TableRow
                                        key={article.id}
                                        className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                        onClick={() => window.location.href = `/admin/news/${article.id}`}
                                    >
                                        <TableCell className="text-gray-200">{article.title}</TableCell>
                                        <TableCell>
                                <span
                                    className={`px-2 py-1 rounded-full text-sm font-medium text-white`}>
                                    {newsTypeLabels[article.type]}
                                </span>
                                        </TableCell>
                                        <TableCell className="text-gray-200">{article.author?.name || 'Inconnu'}</TableCell>
                                        <TableCell className="text-gray-200">
                                            {new Date(article.publishedAt).toLocaleDateString('fr-FR')}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent row click when clicking the button
                                                    window.location.href = `/admin/news/${article.id}`;
                                                }}
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
                    <>
                        <div className="flex justify-center items-center gap-2 mt-6">
                            {Array.from({ length: totalPages }, (_, index) => (
                                <Button
                                    key={index + 1}
                                    variant={currentPage === index + 1 ? "default" : "outline"}
                                    size="sm"
                                    className={currentPage === index + 1
                                        ? "bg-white text-gray-900 hover:bg-gray-100"
                                        : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                                    onClick={() => handlePageChange(index + 1)}
                                >
                                    {index + 1}
                                </Button>
                            ))}
                        </div>
                        <p className="text-center text-sm text-gray-400 mt-2">
                            Page {currentPage} sur {totalPages}
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}