// app/dashboard/page.tsx
import React from 'react';
import { prisma } from '@/lib/prisma';
import BackendNavbar from '@/components/Backend-Navbar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
    const [bookCount, newsCount, genreCount, coupsDeCoeurCount] = await Promise.all([
        prisma.book.count(),
        prisma.news.count(),
        prisma.genre.count(),
        prisma.coupsDeCoeur.count(),
    ]);

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Tableau de bord de l'administration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Books */}
                            <div className="p-6 rounded-lg border bg-blue-50/50 hover:bg-blue-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-blue-700">Catalogue</h2>
                                <p className="text-4xl font-extrabold">{bookCount}</p>
                                <a href="/admin/books">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-blue-200 bg-blue-100 hover:bg-blue-200 text-blue-700"
                                    >
                                        Gestion du catalogue
                                    </Button>
                                </a>
                            </div>

                            {/* Genres */}
                            <div className="p-6 rounded-lg border bg-purple-50/50 hover:bg-purple-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-purple-700">Genres</h2>
                                <p className="text-4xl font-extrabold">{genreCount}</p>
                                <a href="/admin/genres">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-purple-200 bg-purple-100 hover:bg-purple-200 text-purple-700"
                                    >
                                        Gestion des genres
                                    </Button>
                                </a>
                            </div>

                            {/* News */}
                            <div className="p-6 rounded-lg border bg-green-50/50 hover:bg-green-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-green-700">Dernières infos</h2>
                                <p className="text-4xl font-extrabold">{newsCount}</p>
                                <a href="/admin/news">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-green-200 bg-green-100 hover:bg-green-200 text-green-700"
                                    >
                                        Gestion des dernières infos
                                    </Button>
                                </a>
                            </div>

                            <div className="p-6 rounded-lg border bg-pink-50/50 hover:bg-pink-50 transition-colors">
                                <h2 className="text-2xl font-bold mb-2 text-pink-700">Coups de Cœur</h2>
                                <p className="text-4xl font-extrabold">{coupsDeCoeurCount}</p>
                                <a href="/admin/manage_coups_de_coeur">
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full border-pink-200 bg-pink-100 hover:bg-pink-200 text-pink-700"
                                    >
                                        Gestion des Coups de Cœurs
                                    </Button>
                                </a>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}