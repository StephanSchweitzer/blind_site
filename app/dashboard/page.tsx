// app/dashboard/page.tsx
import React from 'react';
import { prisma } from '@/lib/prisma';
import BackendNavbar from '@/components/Backend-Navbar';
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
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Admin Dashboard</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Books Section */}
                            <div className="p-6 rounded-lg border bg-blue-50/50 hover:bg-blue-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-blue-700">Books</h2>
                                <p className="text-4xl font-extrabold">{bookCount}</p>
                                <Link href="/books">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-blue-200 bg-blue-100 hover:bg-blue-200 text-blue-700"
                                    >
                                        Manage Books
                                    </Button>
                                </Link>
                            </div>

                            {/* Genres Section */}
                            <div className="p-6 rounded-lg border bg-purple-50/50 hover:bg-purple-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-purple-700">Genres</h2>
                                <p className="text-4xl font-extrabold">{genreCount}</p>
                                <Link href="/genres">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-purple-200 bg-purple-100 hover:bg-purple-200 text-purple-700"
                                    >
                                        Manage Genres
                                    </Button>
                                </Link>
                            </div>

                            {/* News Section */}
                            <div className="p-6 rounded-lg border bg-green-50/50 hover:bg-green-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-green-700">News Articles</h2>
                                <p className="text-4xl font-extrabold">{newsCount}</p>
                                <Link href="/news">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-green-200 bg-green-100 hover:bg-green-200 text-green-700"
                                    >
                                        Manage News
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}