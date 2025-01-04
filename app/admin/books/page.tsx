// app/admin/books/page.tsx
import { Suspense } from 'react';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '../../../components/Backend-Navbar';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import SearchBar from './search-bar';
import { BooksTable } from './books-table';

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
    searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

async function getBooks(page: number, searchTerm: string) {
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

    const [books, totalBooks] = await Promise.all([
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

    return { books, totalBooks, totalPages: Math.ceil(totalBooks / booksPerPage) };
}

export default async function Books({ searchParams }: PageProps) {
    const pageParam = typeof searchParams.page === 'string' ? searchParams.page :
        Array.isArray(searchParams.page) ? searchParams.page[0] : '1';
    const searchParam = typeof searchParams.search === 'string' ? searchParams.search :
        Array.isArray(searchParams.search) ? searchParams.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { books, totalBooks, totalPages } = await getBooks(page, searchTerm);

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <BooksTable
                    initialBooks={books}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                />
            </div>
        </div>
    );
}