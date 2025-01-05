// app/admin/news/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import BackendNavbar from '../../../components/Backend-Navbar';
import { ArticlesTable } from './articles-table';

type NewsWithAuthor = Prisma.NewsGetPayload<{
    include: {
        author: true;
    };
}>;

interface PageProps {
    searchParams: { [key: string]: string | string[] | undefined };
}

export const dynamic = 'force-dynamic';

async function getArticles(page: number, searchTerm: string) {
    const articlesPerPage = 10;

    const whereClause: Prisma.NewsWhereInput = searchTerm
        ? {
            OR: [
                {
                    title: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    content: {
                        contains: searchTerm,
                        mode: Prisma.QueryMode.insensitive
                    }
                },
                {
                    author: {
                        name: {
                            contains: searchTerm,
                            mode: Prisma.QueryMode.insensitive
                        }
                    }
                }
            ]
        }
        : {};

    const [articles, totalArticles] = await Promise.all([
        prisma.news.findMany({
            where: whereClause,
            include: {
                author: true
            },
            orderBy: {
                publishedAt: 'desc'
            },
            skip: (page - 1) * articlesPerPage,
            take: articlesPerPage,
        }),
        prisma.news.count({ where: whereClause }),
    ]);

    return {
        articles,
        totalArticles,
        totalPages: Math.ceil(totalArticles / articlesPerPage)
    };
}

export default async function Articles({ searchParams }: PageProps) {
    const pageParam = typeof searchParams.page === 'string' ? searchParams.page :
        Array.isArray(searchParams.page) ? searchParams.page[0] : '1';
    const searchParam = typeof searchParams.search === 'string' ? searchParams.search :
        Array.isArray(searchParams.search) ? searchParams.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;

    const { articles, totalArticles, totalPages } = await getArticles(page, searchTerm);

    return (
        <div className="space-y-4">
            <ArticlesTable
                initialArticles={articles}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
)
    ;
}