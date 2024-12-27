// app/genres/[id]/page.tsx
import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import EditGenreForm from './edit-genre-form';

interface Props {
    params: {
        id: string;
    };
}

export default async function EditGenrePage({ params }: Props) {
    const genre = await prisma.genre.findUnique({
        where: {
            id: params.id
        }
    });

    if (!genre) {
        notFound();
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Edit Genre</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EditGenreForm genre={genre} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}