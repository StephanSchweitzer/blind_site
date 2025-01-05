'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebounce } from 'use-debounce';

type Article = {
    id: number;
    title: string;
    publishedAt: Date;
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

export function ArticlesTable({ initialArticles, initialPage, initialSearch, totalPages }: ArticlesTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [articles, setArticles] = useState(initialArticles);
    const [page, setPage] = useState(initialPage);
    const [search, setSearch] = useState(initialSearch);
    const [isPending, startTransition] = useTransition();

    const [debouncedSearch] = useDebounce(search, 300);

    const updateUrl = useCallback((newPage: number, newSearch: string) => {
        const params = new URLSearchParams();
        params.set('page', newPage.toString());
        if (newSearch) params.set('search', newSearch);

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`, { scroll: false });
        });
    }, [pathname, router]);

    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
        updateUrl(1, value);
    };

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        updateUrl(newPage, search);
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
                        Ajouter un Article
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Rechercher les dernières infos..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="max-w-sm bg-white text-gray-900 placeholder:text-gray-500"
                    />
                    {isPending && <span className="text-gray-400">Chargement...</span>}
                </div>

                <div className="rounded-md border border-gray-700 bg-gray-800">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-700 bg-gray-800">
                                <TableHead className="text-gray-200 font-medium">Titre</TableHead>
                                <TableHead className="text-gray-200 font-medium">Auteur</TableHead>
                                <TableHead className="text-gray-200 font-medium">Date de Publication</TableHead>
                                <TableHead className="text-gray-200 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {articles.map((article) => (
                                <TableRow key={article.id} className="border-b border-gray-700 hover:bg-gray-750">
                                    <TableCell className="text-gray-200">{article.title}</TableCell>
                                    <TableCell className="text-gray-200">{article.author?.name || 'Inconnu'}</TableCell>
                                    <TableCell className="text-gray-200">
                                        {new Date(article.publishedAt).toLocaleDateString('fr-FR')}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/news/${article.id}`}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                            >
                                                Modifier
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-center items-center gap-2 mt-6">
                    {Array.from({ length: totalPages }, (_, index) => (
                        <Button
                            key={index + 1}
                            variant={page === index + 1 ? "default" : "outline"}
                            size="sm"
                            className={page === index + 1
                                ? "bg-white text-gray-900 hover:bg-gray-100"
                                : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                            onClick={() => handlePageChange(index + 1)}
                        >
                            {index + 1}
                        </Button>
                    ))}
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">
                    Page {page} sur {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}