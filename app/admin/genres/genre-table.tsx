// app/admin/genres/genres-table.tsx
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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebounce } from 'use-debounce';

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

export function GenresTable({ initialGenres, initialPage, initialSearch, totalPages }: GenresTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [genres, setGenres] = useState(initialGenres);
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
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle>Manage Genres</CardTitle>
                <Link href="/admin/genres/new">
                    <Button>Add New Genre</Button>
                </Link>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Search genres..."
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="max-w-sm"
                    />
                    {isPending && <span>Loading...</span>}
                </div>

                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {genres.map((genre) => (
                                <TableRow key={genre.id}>
                                    <TableCell>{genre.name}</TableCell>
                                    <TableCell>{genre.description || 'N/A'}</TableCell>
                                    <TableCell>
                                        <Link href={`/admin/genres/${genre.id}`}>
                                            <Button variant="outline" size="sm">
                                                Edit
                                            </Button>
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <div className="flex justify-center items-center gap-2 mt-4">
                    {Array.from({ length: totalPages }, (_, index) => (
                        <Button
                            key={index + 1}
                            variant={page === index + 1 ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(index + 1)}
                        >
                            {index + 1}
                        </Button>
                    ))}
                </div>
                <p className="text-center text-sm text-muted-foreground mt-2">
                    Page {page} of {totalPages}
                </p>
            </CardContent>
        </Card>
    );
}