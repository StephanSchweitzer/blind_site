'use client';

import { useEffect, useState } from 'react';
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

type Book = {
    id: number;
    title: string;
    author: string;
    isbn?: string | null;
    readingDurationMinutes?: number | null;
    available: boolean;
    genres: {
        genre: {
            name: string;
        };
    }[];
    addedBy: {
        name: string | null;
        email: string;
    };
    publishedDate: Date | null;
    description: string | null;
    addedById: number;
};

interface BooksTableProps {
    initialBooks: Book[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function BooksTable({ initialBooks, initialPage, initialSearch, totalPages }: BooksTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [books, setBooks] = useState(initialBooks);
    const [search, setSearch] = useState(initialSearch);
    const [debouncedSearch] = useDebounce(search, 300);

    // Get current page from URL
    const currentPage = parseInt(searchParams.get('page') || '1');

    // Update books when initialBooks changes
    useEffect(() => {
        setBooks(initialBooks);
    }, [initialBooks]);

    // Update search when URL changes
    useEffect(() => {
        const searchFromUrl = searchParams.get('search') || '';
        setSearch(searchFromUrl);
    }, [searchParams]);

    const handleSearch = (value: string) => {
        setSearch(value);
        const params = new URLSearchParams(searchParams);
        if (value) {
            params.set('search', value);
        } else {
            params.delete('search');
        }
        params.set('page', '1'); // Reset to first page on search
        router.push(`?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        if (search) {
            params.set('search', search);
        }
        router.push(`?${params.toString()}`);
    };

    const getVisiblePages = (current: number, total: number) => {
        const delta = 2;
        const range = [];
        for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
            range.push(i);
        }
        if (current - delta > 2) {
            range.unshift('...');
        }
        if (current + delta < total - 1) {
            range.push('...');
        }
        range.unshift(1);
        if (total > 1) {
            range.push(total);
        }
        return range;
    };

    const visiblePages = getVisiblePages(currentPage, totalPages);

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                <div>
                    <CardTitle className="text-gray-100">Gestion des livres</CardTitle>
                    <CardDescription className="text-gray-400">
                        Gérer et modifiez les livres
                    </CardDescription>
                </div>
                <Link href="/admin/books/new">
                    <Button className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500">
                        Ajouter un nouveau livre
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Recherche de livres..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="max-w-sm bg-white text-gray-900 placeholder:text-gray-500"
                    />
                </div>

                <div className="rounded-md border border-gray-700 bg-gray-800">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-700 bg-gray-800">
                                <TableHead className="text-gray-200 font-medium">Titre</TableHead>
                                <TableHead className="text-gray-200 font-medium">Auteur</TableHead>
                                <TableHead className="text-gray-200 font-medium">Genres</TableHead>
                                <TableHead className="text-gray-200 font-medium">Durée de lecture</TableHead>
                                <TableHead className="text-gray-200 font-medium">Disponible</TableHead>
                                <TableHead className="text-gray-200 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {books.map((book) => (
                                <TableRow key={book.id} className="border-b border-gray-700 hover:bg-gray-750">
                                    <TableCell className="text-gray-200">
                                        <div>
                                            <div>{book.title}</div>
                                            {book.isbn && (
                                                <div className="text-sm text-gray-400">
                                                    ISBN: {book.isbn}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-gray-200">{book.author}</TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.genres.map(g => g.genre.name).join(', ') || 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.readingDurationMinutes
                                            ? `${book.readingDurationMinutes} mins`
                                            : 'N/A'
                                        }
                                    </TableCell>
                                    <TableCell className="text-gray-200">
                                        {book.available ? 'Oui' : 'Non'}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`/admin/books/${book.id}`}>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                            >
                                                Editer
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-center items-center gap-2 mt-6">
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(1)}
                        disabled={currentPage === 1}
                    >
                        {'<<'}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        {'<'}
                    </Button>
                    {visiblePages.map((page, index) => (
                        typeof page === 'number' ? (
                            <Button
                                key={index}
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                className={currentPage === page
                                    ? "bg-white text-gray-900 hover:bg-gray-100"
                                    : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}
                                onClick={() => handlePageChange(page)}
                            >
                                {page}
                            </Button>
                        ) : (
                            <span key={index} className="text-gray-400">{page}</span>
                        )
                    ))}
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                    >
                        {'>'}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"
                        onClick={() => handlePageChange(totalPages)}
                        disabled={currentPage === totalPages}
                    >
                        {'>>'}
                    </Button>
                </div>
                <p className="text-center text-sm text-gray-400 mt-2">
                    Page {currentPage} of {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}
