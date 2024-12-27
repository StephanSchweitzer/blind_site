// app/genres/page.tsx
import React from 'react';
import { prisma } from '@/lib/prisma';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import SearchBar from './search-bar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function GenresPage() {
    const genres = await prisma.genre.findMany({
        orderBy: {
            name: 'asc'
        }
    });

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold">Genres</h1>
                    <Link href="/genres/new">
                        <Button>Add New Genre</Button>
                    </Link>
                </div>

                <SearchBar />

                <div className="grid gap-4 mt-6">
                    {genres.map((genre) => (
                        <Card key={genre.id}>
                            <CardHeader>
                                <CardTitle>{genre.name}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-600">{genre.description}</p>
                                <div className="mt-4">
                                    <Link href={`/genres/${genre.id}`}>
                                        <Button variant="outline">Edit</Button>
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}