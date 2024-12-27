// app/dashboard/page.tsx
import React from 'react';
import { prisma } from '@/lib/prisma';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const [bookCount, newsCount, genreCount] = await Promise.all([
        prisma.book.count(),
        prisma.news.count(),
        prisma.genre.count(),
    ]);

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Admin Dashboard</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-6 bg-blue-50 rounded-lg">
                                <h2 className="text-2xl font-bold mb-2">Books</h2>
                                <p className="text-4xl font-extrabold">{bookCount}</p>
                                <Link href="/books">
                                    <Button className="mt-4">Manage Books</Button>
                                </Link>
                            </div>
                            <div className="p-6 bg-green-50 rounded-lg">
                                <h2 className="text-2xl font-bold mb-2">News Articles</h2>
                                <p className="text-4xl font-extrabold">{newsCount}</p>
                                <Link href="/news">
                                    <Button className="mt-4">Manage News</Button>
                                </Link>
                            </div>
                            <div className="p-6 bg-purple-50 rounded-lg">
                                <h2 className="text-2xl font-bold mb-2">Genres</h2>
                                <p className="text-4xl font-extrabold">{genreCount}</p>
                                <Link href="/genres">
                                    <Button className="mt-4">Manage Genres</Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}