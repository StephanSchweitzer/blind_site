// app/admin/news/page.tsx
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ArticlesTable } from './articles-table';

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

async function getArticles(page: number, searchTerm: string) {
    const articlesPerPage = 10;

    try {
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
                        type: {
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
    } catch (error) {
        console.error('Error fetching articles:', error);
        return {
            articles: [],
            totalArticles: 0,
            totalPages: 0
        };
    }
}

export default async function Articles({ searchParams }: PageProps) {
    // Await searchParams before accessing its properties
    const params = await searchParams;

    // Parse page parameter
    const pageStr = Array.isArray(params.page) ? params.page[0] : params.page ?? '1';
    const page = Math.max(1, parseInt(pageStr, 10) || 1);

    // Parse search parameter
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search ?? '';

    const { articles, totalPages } = await getArticles(page, searchTerm);

    return (
        <div className="space-y-4">
            <ArticlesTable
                initialArticles={articles}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
            />
        </div>
    );
}