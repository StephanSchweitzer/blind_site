// app/admin/news/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ArticlesTable } from './articles-table';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { buildNewsSearchWhere } from '@/lib/search';
import { suggestSearches } from '@/lib/search-suggest';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

async function getArticles(page: number, searchTerm: string) {
    const articlesPerPage = 10;

    try {
        // Tokenisé, insensible aux apostrophes, et le type se cherche aussi par
        // son libellé affiché (« Événement ») — voir buildNewsSearchWhere.
        const whereFor = (term: string): Prisma.NewsWhereInput => {
            const tokenClauses = buildNewsSearchWhere(term);
            return tokenClauses ? { AND: tokenClauses } : {};
        };
        const whereClause = whereFor(searchTerm);

        const [articles, totalArticles] = await Promise.all([
            prisma.news.findMany({
                where: whereClause,
                select: {
                    id: true,
                    title: true,
                    publishedAt: true,
                    type: true,
                    author: {
                        select: {
                            name: true
                        }
                    }
                },
                orderBy: {
                    publishedAt: 'desc'
                },
                skip: pageSkip(page, articlesPerPage),
                take: articlesPerPage,
            }),
            prisma.news.count({ where: whereClause }),
        ]);

        // Only when the search found nothing — see lib/search-suggest.ts.
        const searchSuggestions =
            totalArticles === 0 && searchTerm
                ? await suggestSearches(searchTerm, ['news', 'people'], (q) =>
                    prisma.news.count({ where: whereFor(q) }))
                : [];

        return {
            articles,
            totalArticles,
            totalPages: Math.ceil(totalArticles / articlesPerPage),
            searchSuggestions,
        };
    } catch (error) {
        console.error('Error fetching articles:', error);
        return {
            articles: [],
            totalArticles: 0,
            totalPages: 0,
            searchSuggestions: [],
        };
    }
}

export default async function Articles({ searchParams }: PageProps) {
    // Await searchParams before accessing its properties
    const params = await searchParams;

    // Parse page parameter
    const pageStr = Array.isArray(params.page) ? params.page[0] : params.page ?? '1';
    const page = parsePageParam(pageStr);

    // Parse search parameter
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search ?? '';

    const { articles, totalPages, searchSuggestions } = await getArticles(page, searchTerm);

    return (
        <div className="space-y-4">
            <ArticlesTable
                initialArticles={articles}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}