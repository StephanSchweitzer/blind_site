// app/admin/books/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
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
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
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
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { books, totalBooks, totalPages } = await getBooks(page, searchTerm);

    return (
        <div className="space-y-4">
            <BooksTable
                initialBooks={books}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
    );
}