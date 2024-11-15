import React from 'react';
import { use } from 'react';
import { prisma } from '@/lib/prisma';
import Navbar from '@/components/Navbar';
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

export default function News({ params }: { params: Promise<{ search: string }> }) {
    // Use `use` to resolve the `params` Promise
    const { search } = use(params);

    // Construct the `whereClause` based on the resolved `search` parameter
    const whereClause = search
        ? {
            OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { author: { name: { contains: search, mode: 'insensitive' } } },
            ],
        }
        : {};

    // Fetch articles using Prisma
    const articles = use(
        prisma.news.findMany({
            where: whereClause,
            include: { author: true },
        })
    );

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                        <CardTitle>Manage News Articles</CardTitle>
                        <Link href="/news/new">
                            <Button>Add New Article</Button>
                        </Link>
                    </CardHeader>
                    <CardContent>
                        <SearchBar />
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Published At</TableHead>
                                        <TableHead>Author</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {articles.map((article) => (
                                        <TableRow key={article.id}>
                                            <TableCell>{article.title}</TableCell>
                                            <TableCell>{new Date(article.publishedAt).toLocaleDateString()}</TableCell>
                                            <TableCell>{article.author?.name || 'N/A'}</TableCell>
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
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
