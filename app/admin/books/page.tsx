// app/admin/books/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BooksTable from './books-table';
import { notFound } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBooks(page: number, searchTerm: string, filter: string = 'all', genreIds: number[] = []) {
    const booksPerPage = 10;

    let whereClause: Prisma.BookWhereInput = {};

    if (searchTerm) {
        switch (filter) {
            case 'title':
                whereClause = {
                    title: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                };
                break;
            case 'author':
                whereClause = {
                    author: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                };
                break;
            case 'description':
                whereClause = {
                    description: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                };
                break;
            case 'genre':
                whereClause = {
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
                };
                break;
            default:
                whereClause = {
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
                            description: {
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
        }
    }

    // Add genre filter if genreIds are provided
    if (genreIds.length > 0) {
        const genreFilter = {
            genres: {
                some: {
                    genreId: {
                        in: genreIds
                    }
                }
            }
        };

        if (Object.keys(whereClause).length > 0) {
            whereClause = {
                AND: [whereClause, genreFilter]
            };
        } else {
            whereClause = genreFilter;
        }
    }

    try {
        const [books, totalBooks, genres] = await Promise.all([
            prisma.book.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                skip: Math.max(0, (page - 1) * booksPerPage),
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
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            }),
            prisma.book.count({ where: whereClause }),
            prisma.genre.findMany({
                select: {
                    id: true,
                    name: true,
                },
                orderBy: {
                    name: 'asc',
                },
            }),
        ]);

        return {
            books,
            totalBooks,
            totalPages: Math.ceil(totalBooks / booksPerPage),
            availableGenres: genres,
        };
    } catch (error) {
        console.error('Error fetching books:', error);
        throw new Error('Failed to fetch books');
    }
}

export default async function AdminBooksPage({ searchParams }: PageProps) {
    try {
        const params = await searchParams;

        const page = Math.max(1, parseInt(
            Array.isArray(params.page) ? params.page[0] : params.page || '1'
        ));
        const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search || '';
        const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter || 'all';
        const genreIds = (Array.isArray(params.genres) ? params.genres[0] : params.genres || '')
            .split(',')
            .filter(Boolean)
            .map(Number)
            .filter(id => !isNaN(id));

        const { books, totalBooks, totalPages, availableGenres } = await getBooks(page, searchTerm, filter, genreIds);

        return (
            <div className="space-y-4">
                <BooksTable
                    initialBooks={books}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                    availableGenres={availableGenres}
                    initialTotalBooks={totalBooks}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Admin Books page:', error);
        notFound();
    }
}