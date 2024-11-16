import React from 'react';
import { prisma } from '@/lib/prisma';
import Navbar from '../../components/Navbar';
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
import SearchBar from './search-bar';

interface Book {
    id: number;
    title: string;
    author: string;
    genre: string | null;
    available: boolean;
    createdAt: Date; // Ensure createdAt is included for sorting
}

interface PageProps {
    searchParams: { [key: string]: string | string[] | undefined }
}

export const dynamic = 'force-dynamic';

export default async function Books({ searchParams }: PageProps) {
    // Handle both string and array cases for searchParams
    const pageParam = typeof searchParams.page === 'string' ? searchParams.page :
        Array.isArray(searchParams.page) ? searchParams.page[0] : '1';
    const searchParam = typeof searchParams.search === 'string' ? searchParams.search :
        Array.isArray(searchParams.search) ? searchParams.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;
    const booksPerPage = 10;

    const whereClause = searchTerm
        ? {
            OR: [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { author: { contains: searchTerm, mode: 'insensitive' } },
                { genre: { contains: searchTerm, mode: 'insensitive' } },
            ],
        }
        : {};

    const [books, totalBooks] = await Promise.all([
        prisma.book.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }, // Sort by creation date in descending order
            skip: (page - 1) * booksPerPage,
            take: booksPerPage,
        }),
        prisma.book.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalBooks / booksPerPage);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage Books</CardTitle>
                        <Link href="/books/new">
                            <Button>Add New Book</Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <SearchBar />
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Author</TableHead>
                                        <TableHead>Genre</TableHead>
                                        <TableHead>Available</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {books.map((book) => (
                                        <TableRow key={book.id}>
                                            <TableCell>{book.title}</TableCell>
                                            <TableCell>{book.author}</TableCell>
                                            <TableCell>{book.genre || 'N/A'}</TableCell>
                                            <TableCell>{book.available ? 'Yes' : 'No'}</TableCell>
                                            <TableCell>
                                                <Link href={`/books/${book.id}`}>
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
                                <Link
                                    key={index + 1}
                                    href={`/books?page=${index + 1}&search=${searchTerm}`}
                                >
                                    <Button
                                        variant={page === index + 1 ? "default" : "outline"}
                                        size="sm"
                                    >
                                        {index + 1}
                                    </Button>
                                </Link>
                            ))}
                        </div>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                            Page {page} of {totalPages}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
