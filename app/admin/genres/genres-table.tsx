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

type Genre = {
    id: number;
    name: string;
    description: string | null;
};

interface GenresTableProps {
    initialGenres: Genre[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function GenresTable({ initialGenres, initialSearch, totalPages }: GenresTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [genres, setGenres] = useState(initialGenres);
    const [search, setSearch] = useState(initialSearch);

    // Get current page from URL
    const currentPage = parseInt(searchParams.get('page') || '1');

    // Update genres when initialGenres changes
    useEffect(() => {
        setGenres(initialGenres);
    }, [initialGenres]);

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

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-gray-700">
                <div>
                    <CardTitle className="text-gray-100">Gestion des Genres</CardTitle>
                    <CardDescription className="text-gray-400">
                        Gérer et modifier les différents genres associés aux livres
                    </CardDescription>
                </div>
                <Link href="/admin/genres/new">
                    <Button className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500">
                        Ajouter un Genre
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Rechercher des genres..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="max-w-sm bg-white text-gray-900 placeholder:text-gray-500"
                    />
                </div>

                <div className="rounded-md border border-gray-700 bg-gray-800">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-b border-gray-700 bg-gray-800">
                                <TableHead className="text-gray-200 font-medium">Nom</TableHead>
                                <TableHead className="text-gray-200 font-medium">Description</TableHead>
                                <TableHead className="text-gray-200 font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {genres.map((genre) => (
                                <TableRow
                                    key={genre.id}
                                    className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                                    onClick={() => window.location.href = `/admin/genres/${genre.id}`}
                                >
                                    <TableCell className="text-gray-200">{genre.name}</TableCell>
                                    <TableCell className="text-gray-200">{genre.description || 'N/A'}</TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                            onClick={(e) => {
                                                e.stopPropagation(); // Prevent row click when clicking the button
                                                window.location.href = `/admin/genres/${genre.id}`;
                                            }}
                                        >
                                            Modifier
                                        </Button>
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
            </CardContent>
        </Card>
    );
}