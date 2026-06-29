'use client';

import { useState } from 'react';
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
import type { Genre } from '@/types';

interface GenresTableProps {
    initialGenres: Genre[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function GenresTable({ initialGenres, initialSearch, totalPages }: GenresTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch);

    // Get current page from URL
    const currentPage = parseInt(searchParams.get('page') || '1');

    // Keep the search box in sync with the URL (back/forward, deep links)
    // without an effect: adjust state during render when the URL value changes.
    const urlSearch = searchParams.get('search') ?? '';
    const [syncedSearch, setSyncedSearch] = useState(urlSearch);
    if (urlSearch !== syncedSearch) {
        setSyncedSearch(urlSearch);
        setSearch(urlSearch);
    }

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
        <Card className="bg-card border-border">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between space-y-0 pb-4 border-b border-border">
                <div>
                    <CardTitle className="text-foreground">Gestion des Genres</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Gérer et modifier les différents genres associés aux livres
                    </CardDescription>
                </div>
                <Link href="/admin/genres/new" className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto bg-muted text-foreground border-border hover:bg-muted">
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
                        className="max-w-sm bg-white text-muted-foreground placeholder:text-muted-foreground"
                    />
                </div>

                <div className="rounded-md border border-border bg-card">
                    <Table>
                        <TableHeader className="bg-card">
                            <TableRow className="border-b border-border">
                                <TableHead className="text-foreground font-medium">Nom</TableHead>
                                <TableHead className="text-foreground font-medium">Description</TableHead>
                                <TableHead className="text-foreground font-medium">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {initialGenres.map((genre) => (
                                <TableRow
                                    key={genre.id}
                                    className="border-b border-border hover:bg-muted cursor-pointer"
                                    onClick={() => window.location.href = `/admin/genres/${genre.id}`}
                                >
                                    <TableCell className="text-foreground">{genre.name}</TableCell>
                                    <TableCell className="text-foreground">{genre.description || 'N/A'}</TableCell>
                                    <TableCell>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="bg-muted text-foreground border-border hover:bg-muted"
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

                <div className="flex flex-wrap justify-center items-center gap-2 mt-6">
                    {Array.from({ length: totalPages }, (_, index) => (
                        <Button
                            key={index + 1}
                            variant={currentPage === index + 1 ? "default" : "outline"}
                            size="sm"
                            className={currentPage === index + 1
                                ? "bg-white text-muted-foreground hover:bg-muted"
                                : "bg-card text-foreground border-border hover:bg-muted"}
                            onClick={() => handlePageChange(index + 1)}
                        >
                            {index + 1}
                        </Button>
                    ))}
                </div>
                <p className="text-center text-sm text-muted-foreground mt-2">
                    Page {currentPage} sur {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}