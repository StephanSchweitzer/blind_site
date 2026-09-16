// app/admin/genres/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { GenresTable } from './genres-table';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { buildGenreSearchWhere } from '@/lib/search';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

export const dynamic = 'force-dynamic';

async function getGenres(page: number, searchTerm: string) {
    const genresPerPage = 10;

    // Tokenisé et insensible aux apostrophes comme partout ailleurs —
    // voir buildGenreSearchWhere.
    const tokenClauses = buildGenreSearchWhere(searchTerm);
    const whereClause: Prisma.GenreWhereInput = tokenClauses ? { AND: tokenClauses } : {};

    const [genres, totalGenres] = await Promise.all([
        prisma.genre.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }, // Keep the original ordering
            skip: pageSkip(page, genresPerPage),
            take: genresPerPage,
            // The edit dialogue replaced the genre detail page — it still tells
            // you how many books hang off the genre before you delete it.
            include: { _count: { select: { books: true } } },
        }),
        prisma.genre.count({ where: whereClause }),
    ]);

    return {
        genres,
        totalGenres,
        totalPages: Math.ceil(totalGenres / genresPerPage)
    };
}

export default async function Genres({ searchParams }: PageProps) {
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parsePageParam(pageParam);
    const searchTerm = searchParam;

    const { genres, totalPages } = await getGenres(page, searchTerm);

    return (
        <div className="space-y-4">
            <GenresTable
                initialGenres={genres.map(({ _count, ...genre }) => ({
                    ...genre,
                    booksCount: _count.books,
                }))}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
    );
}