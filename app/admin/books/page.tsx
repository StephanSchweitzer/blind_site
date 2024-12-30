import React from 'react';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '../../../components/Backend-Navbar';
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
import { Suspense } from 'react';

type BookWithRelations = Prisma.BookGetPayload<{
    include: {
        addedBy: {
            select: {
                name: true;
                email: true;
            };
        };
        genres: {
            select: {
                genre: {
                    select: {
                        name: true;
                    };
                };
            };
        };
    };
}>;
interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function Books({ searchParams }: PageProps) {
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;
    const booksPerPage = 10;

    const whereClause: Prisma.BookWhereInput = {
        OR: [
            {
                title: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            },
            {
                author: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            },
            {
                genres: {
                    some: {
                        genre: {
                            name: {
                                contains: searchTerm,
                                mode: Prisma.QueryMode.insensitive
                            }
                        }
                    }
                }
            }
        ]
    };

    const [books, totalBooks]: [BookWithRelations[], number] = await Promise.all([
        prisma.book.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * booksPerPage,
            take: booksPerPage,
            include: {
                addedBy: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
                genres: {
                    select: {
                        genre: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.book.count({ where: whereClause }),
    ]);

    const totalPages = Math.ceil(totalBooks / booksPerPage);

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage Books</CardTitle>
                        <Link href="/admin/books/new">
                            <Button>Add New Book</Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<div>Loading...</div>}>
                            <SearchBar />
                        </Suspense>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Author</TableHead>
                                        <TableHead>Genres</TableHead>
                                        <TableHead>Reading Time</TableHead>
                                        {/*<TableHead>Added By</TableHead>*/}
                                        <TableHead>Available</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {books.map((book: BookWithRelations) => (
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
                                            {/*<TableCell>*/}
                                            {/*    {book.addedBy.name || book.addedBy.email}*/}
                                            {/*</TableCell>*/}
                                            <TableCell>{book.available ? 'Yes' : 'No'}</TableCell>
                                            <TableCell>
                                                <Link href={`/app/admin/books/${book.id}`}>
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
                                    href={`/admin/books?page=${index + 1}&search=${searchTerm}`}
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