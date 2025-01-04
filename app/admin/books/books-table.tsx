'use client';
// app/admin/books/books-table.tsx
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

type Book = {
    id: string;
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
};

interface BooksTableProps {
    initialBooks: Book[];
    initialPage: number;
    initialSearch: string;
    totalPages: number;
}

export function BooksTable({ initialBooks, initialPage, initialSearch, totalPages }: BooksTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [books, setBooks] = useState(initialBooks);
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
                <CardTitle>Manage Books</CardTitle>
                <Link href="/admin/books/new">
                    <Button>Add New Book</Button>
                </Link>
            </CardHeader>
            <CardContent>
                <div className="flex items-center space-x-2 mb-4">
                    <Input
                        placeholder="Search books..."
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
                                <TableHead>Author</TableHead>
                                <TableHead>Genres</TableHead>
                                <TableHead>Reading Time</TableHead>
                                <TableHead>Available</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {books.map((book) => (
                                <TableRow key={book.id}>
                                    <TableCell>
                                        <div>
                                            <div>{book.title}</div>
                                            {book.isbn && (
                                                <div className="text-sm text-muted-foreground">
                                                    ISBN: {book.isbn}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{book.author}</TableCell>
                                    <TableCell>
                                        {book.genres.map(g => g.genre.name).join(', ') || 'N/A'}
                                    </TableCell>
                                    <TableCell>
                                        {book.readingDurationMinutes
                                            ? `${book.readingDurationMinutes} mins`
                                            : 'N/A'
                                        }
                                    </TableCell>
                                    <TableCell>{book.available ? 'Yes' : 'No'}</TableCell>
                                    <TableCell>
                                        <Link href={`/admin/books/${book.id}`}>
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