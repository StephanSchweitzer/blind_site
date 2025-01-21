// app/genres/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { notFound } from 'next/navigation';
import EditGenreForm from './edit-genre-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import Link from 'next/link';

const ITEMS_PER_PAGE = 10;

type GenreWithBooks = Prisma.GenreGetPayload<{
    include: {
        books: {
            select: {
                book: {
                    select: {
                        title: true;
                        author: true;
                    };
                };
            };
        };
        _count: {
            select: { books: true };
        };
    };
}>;

interface PageProps {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

async function getGenre(id: number, page: number = 1) {
    const skip = (page - 1) * ITEMS_PER_PAGE;

    const genre = await prisma.genre.findUnique({
        where: {
            id: id
        },
        include: {
            books: {
                skip,
                take: ITEMS_PER_PAGE,
                select: {
                    book: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                },
            },
            _count: {
                select: { books: true }
            }
        },
    });

    if (!genre) {
        notFound();
    }

    return genre;
}

export default async function EditGenrePage({ params, searchParams }: PageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;

    const { id } = resolvedParams;
    const page = typeof resolvedSearchParams.page === 'string'
        ? parseInt(resolvedSearchParams.page, 10)
        : 1;

    const genre = await getGenre(parseInt(id, 10), page);
    const totalPages = Math.ceil(genre._count.books / ITEMS_PER_PAGE);

    return (
        <div className="space-y-6">
            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-700">
                    <CardTitle className="text-gray-100">Modifier le Genre</CardTitle>
                    <CardDescription className="text-gray-400">
                        Modifier les détails du genre et voir les livres associés
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <EditGenreForm genre={genre} />
                </CardContent>
            </Card>

            {genre._count.books > 0 && (
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="border-b border-gray-700">
                        <CardTitle className="text-gray-100">Livres associés</CardTitle>
                        <CardDescription className="text-gray-400">
                            {genre._count.books} livre(s) dans ce genre
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <ul className="divide-y divide-gray-700">
                            {genre.books.map((bookRelation, index) => (
                                <li
                                    key={index}
                                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                                >
                                    <span className="text-sm font-medium text-gray-200">
                                        {bookRelation.book.title}
                                    </span>
                                    <span className="text-sm text-gray-400">
                                        {bookRelation.book.author}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
                                <Link
                                    href={`/genres/${id}?page=${page - 1}`}
                                    className={`px-3 py-1 text-sm rounded-md ${
                                        page <= 1
                                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                            : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                    }`}
                                    aria-disabled={page <= 1}
                                >
                                    Précédent
                                </Link>
                                <span className="text-sm text-gray-400">
                                    Page {page} sur {totalPages}
                                </span>
                                <Link
                                    href={`/admin/genres/${id}?page=${page + 1}`}
                                    scroll={false}
                                    className={`px-3 py-1 text-sm rounded-md ${
                                        page >= totalPages
                                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                            : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                    }`}
                                    aria-disabled={page >= totalPages}
                                >
                                    Suivant
                                </Link>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}