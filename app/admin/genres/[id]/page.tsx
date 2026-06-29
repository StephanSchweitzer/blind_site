// app/genres/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import EditGenreForm from './edit-genre-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import Link from 'next/link';

const ITEMS_PER_PAGE = 10;

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
            <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                    <CardTitle className="text-foreground">Modifier le Genre</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Modifier les détails du genre et voir les livres associés
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <EditGenreForm genre={genre} />
                </CardContent>
            </Card>

            {genre._count.books > 0 && (
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="text-foreground">Livres associés</CardTitle>
                        <CardDescription className="text-muted-foreground">
                            {genre._count.books} livre(s) dans ce genre
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <ul className="divide-y divide-border">
                            {genre.books.map((bookRelation, index) => (
                                <li
                                    key={index}
                                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                                >
                                    <span className="text-sm font-medium text-foreground">
                                        {bookRelation.book.title}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {bookRelation.book.author}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        {totalPages > 1 && (
                            <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
                                <Link
                                    href={`/genres/${id}?page=${page - 1}`}
                                    className={`px-3 py-1 text-sm rounded-md ${
                                        page <= 1
                                            ? 'bg-card text-muted-foreground cursor-not-allowed'
                                            : 'bg-muted text-foreground hover:bg-muted'
                                    }`}
                                    aria-disabled={page <= 1}
                                >
                                    Précédent
                                </Link>
                                <span className="text-sm text-muted-foreground">
                                    Page {page} sur {totalPages}
                                </span>
                                <Link
                                    href={`/admin/genres/${id}?page=${page + 1}`}
                                    scroll={false}
                                    className={`px-3 py-1 text-sm rounded-md ${
                                        page >= totalPages
                                            ? 'bg-card text-muted-foreground cursor-not-allowed'
                                            : 'bg-muted text-foreground hover:bg-muted'
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