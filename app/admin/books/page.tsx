// app/admin/books/page.tsx
import { prisma } from '@/lib/prisma';
import BooksTable from './books-table';
import { notFound } from 'next/navigation';
import { AudioFilter } from '@/lib/books/searchWhere';
import { listAdminBooks } from '@/lib/books/bookList';
import { normalizeSearchQuery } from '@/lib/search-query';
import { pageInfo, parsePageParam, parsePageSizeParam, redirectPastLastPage } from '@/lib/pagination';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * The first page of the table, read by the same engine /api/books serves the
 * table's own searches from (lib/books/bookList.ts) — never a second one.
 *
 * This page used to build its own Prisma `contains` search. Prisma renders the
 * genre arm of that OR as `"Book"."id" IN (SELECT … JOIN "Genre" …)`, a hashed
 * subplan no index can serve, so each of its four queries read every book —
 * and it re-ran on every reload and every router.refresh() of a searched URL.
 * On Supabase's free tier that was the load that took the database down on
 * 2026-09-24. It was also accent-sensitive, so the rows painted from the
 * server could differ from the ones the table fetched a moment later.
 */
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
    try {
        const [result, genres] = await Promise.all([
            listAdminBooks({
                // Normalized exactly as /api/books normalizes it, so « #42 »
                // finds book 42 here too.
                search: normalizeSearchQuery(searchTerm),
                filter,
                genres: genreIds,
                page,
                limit: pageSize,
                available,
                hidden,
                audio,
                recent: false,
                since: null,
            }),
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
            books: result.books,
            pagination: pageInfo(page, pageSize, result.total),
            availableGenres: genres,
            availableCount: result.availableCount,
            unavailableCount: result.unavailableCount,
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
