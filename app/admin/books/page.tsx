// app/admin/books/page.tsx
import { prisma } from '@/lib/prisma';
import BooksTable from './books-table';
import { notFound } from 'next/navigation';
import { buildBookScopeWhere, AudioFilter } from '@/lib/books/searchWhere';
import { pageInfo, pageSkip, parsePageParam, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getBooks(
    page: number,
    pageSize: number,
    searchTerm: string,
    filter: string = 'all',
    genreIds: number[] = [],
    available?: boolean,
    hidden?: boolean,
    audio?: AudioFilter
) {
    const booksPerPage = pageSize;

    // Every filter except availability, so the disponible/en attente counts
    // reflect the rest of the current filter set without being gated by the
    // availability filter itself.
    const scopedWhere = buildBookScopeWhere({
        searchTerm,
        filter,
        genreIds,
        includeHidden: true,
        hidden,
        audio,
    });
    const listWhere = available !== undefined
        ? { AND: [scopedWhere, { available }] }
        : scopedWhere;

    try {
        const [books, totalBooks, availableCount, unavailableCount, genres] = await Promise.all([
            prisma.book.findMany({
                where: listWhere,
                orderBy: { createdAt: 'desc' },
                skip: pageSkip(page, booksPerPage),
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
            prisma.book.count({ where: listWhere }),
            prisma.book.count({ where: { AND: [scopedWhere, { available: true }] } }),
            prisma.book.count({ where: { AND: [scopedWhere, { available: false }] } }),
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
            pagination: pageInfo(page, pageSize, totalBooks),
            availableGenres: genres,
            availableCount,
            unavailableCount,
        };
    } catch (error) {
        console.error('Error fetching books:', error);
        throw new Error('Failed to fetch books');
    }
}

export default async function AdminBooksPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const pageSize = parsePageSizeParam(params.perPage);
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search || '';
    const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter || 'all';
    const genreIds = (Array.isArray(params.genres) ? params.genres[0] : params.genres || '')
        .split(',')
        .filter(Boolean)
        .map(Number)
        .filter(id => !isNaN(id));
    const availableParam = Array.isArray(params.available) ? params.available[0] : params.available;
    const available = availableParam === 'true' ? true : availableParam === 'false' ? false : undefined;
    const hiddenParam = Array.isArray(params.hidden) ? params.hidden[0] : params.hidden;
    const hidden = hiddenParam === 'true' ? true : hiddenParam === 'false' ? false : undefined;
    const audioParam = Array.isArray(params.audio) ? params.audio[0] : params.audio;
    const audio: AudioFilter = audioParam === 'missing' ? 'missing' : audioParam === 'present' ? 'present' : undefined;

    // Only the data fetch is guarded; notFound() throws (returns `never`),
    // so `data` is definitely assigned past this point.
    let data: Awaited<ReturnType<typeof getBooks>>;
    try {
        data = await getBooks(page, pageSize, searchTerm, filter, genreIds, available, hidden, audio);
    } catch (error) {
        console.error('Error in Admin Books page:', error);
        notFound();
    }

    const { books, pagination, availableGenres, availableCount, unavailableCount } = data;
    redirectPastLastPage('/admin/books', params, pagination, books.length);

    return (
        <div className="space-y-4">
            <BooksTable
                initialBooks={books}
                pagination={pagination}
                initialSearch={searchTerm}
                availableGenres={availableGenres}
                initialAvailableCount={availableCount}
                initialUnavailableCount={unavailableCount}
            />
        </div>
    );
}