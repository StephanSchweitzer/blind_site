// app/admin/manage_coups_de_coeur/coups-table.tsx
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

interface Book {
    id: number;
    title: string;
    description: string | null;
    addedById: number;
    createdAt: Date;
    updatedAt: Date;
    author: string;
    publishedDate: Date | null;
    isbn: string | null;
    readingDurationMinutes: number | null;
    available: boolean;
}

interface CoupDeCoeurBook {
    book: Book;
}

type CoupDeCoeur = {
    id: number;
    title: string;
    active: boolean;
    createdAt: Date;
    addedBy: {
        name: string | null;
    } | null;
    books: CoupDeCoeurBook[];
};

interface CoupsTableProps {
    initialItems: CoupDeCoeur[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function CoupsTable({ initialItems, initialPage, initialSearch, totalPages }: CoupsTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [items, setItems] = useState(initialItems);
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
                <CardTitle>Manage Coups de Coeur</CardTitle>
                <Link href="/admin/manage_coups_de_coeur/new">
                    <Button>Add New Coup de Coeur</Button>
                </Link>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Search coups de coeur..."
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
                                <TableHead>Title</TableHead>
                                <TableHead>Added By</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Books</TableHead>
                                <TableHead>Created At</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {items.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{item.title}</TableCell>
                                    <TableCell>{item.addedBy?.name || 'Unknown'}</TableCell>
                                    <TableCell>{item.active ? 'Active' : 'Inactive'}</TableCell>
                                    <TableCell>{item.books.length} books</TableCell>
                                    <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        <Link href={`/admin/manage_coups_de_coeur/${item.id}`}>
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