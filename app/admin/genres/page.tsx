// app/admin/genres/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { GenresTable } from './genres-table';

interface PageProps {
    searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

async function getGenres(page: number, searchTerm: string) {
    const genresPerPage = 10;

    const whereClause: Prisma.GenreWhereInput = {
        OR: [
            {
                name: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            },
            {
                description: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive
                }
            }
        ]
    };

    const [genres, totalGenres] = await Promise.all([
        prisma.genre.findMany({
            where: whereClause,
            orderBy: { name: 'asc' }, // Keep the original ordering
            skip: (page - 1) * genresPerPage,
            take: genresPerPage,
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
    const pageParam = typeof searchParams.page === 'string' ? searchParams.page :
        Array.isArray(searchParams.page) ? searchParams.page[0] : '1';
    const searchParam = typeof searchParams.search === 'string' ? searchParams.search :
        Array.isArray(searchParams.search) ? searchParams.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { genres, totalGenres, totalPages } = await getGenres(page, searchTerm);

    return (
        <div className="space-y-4">
            <GenresTable
                initialGenres={genres}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
    );
}