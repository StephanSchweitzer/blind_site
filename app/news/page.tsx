import React from 'react';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import Navbar from '../../components/Navbar';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import SearchBar from './search-bar';
import { Suspense } from 'react';

type NewsWithAuthor = Prisma.NewsGetPayload<{
    include: {
        author: true;
    };
}>;

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = 'force-dynamic';

export default async function Articles({ searchParams }: PageProps) {
    const params = await searchParams;

    const pageParam = typeof params.page === 'string' ? params.page :
        Array.isArray(params.page) ? params.page[0] : '1';
    const searchParam = typeof params.search === 'string' ? params.search :
        Array.isArray(params.search) ? params.search[0] : '';

    const page = parseInt(pageParam);
    const searchTerm = searchParam;
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

    const totalPages = Math.ceil(totalArticles / articlesPerPage);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage Articles</CardTitle>
                        <Link href="/news/new">
                            <Button>Add New Article</Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <Suspense fallback={<div>Loading...</div>}>
                            <SearchBar />
                        </Suspense>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Author</TableHead>
                                        <TableHead>Published At</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {articles.map((article: NewsWithAuthor) => (
                                        <TableRow key={article.id}>
                                            <TableCell>{article.title}</TableCell>
                                            <TableCell>{article.author?.name || 'Unknown'}</TableCell>
                                            <TableCell>{new Date(article.publishedAt).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <Link href={`/news/${article.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        Edit
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex justify-center items-center gap-2 mt-4">
                            {Array.from({ length: totalPages }, (_, index) => (
                                <Link
                                    key={index + 1}
                                    href={`/news?page=${index + 1}&search=${searchTerm}`}
                                >
                                    <Button
                                        variant={page === index + 1 ? "default" : "outline"}
                                        size="sm"
                                    >
                                        {index + 1}
                                    </Button>
                                </Link>
                            ))}
                        </div>
                        <p className="text-center text-sm text-muted-foreground mt-2">
                            Page {page} of {totalPages}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}