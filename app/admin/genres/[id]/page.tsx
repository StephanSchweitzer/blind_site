// app/genres/[id]/page.tsx
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import EditGenreForm from './edit-genre-form';
import BackendNavbar from "@/components/Backend-Navbar";
import React from "react";

interface Props {
    params: {
        id: string;
    };
}

export default async function EditGenrePage({ params }: Props) {
    const { id } = await params;

    const genre = await prisma.genre.findUnique({
        where: {
            id: parseInt(id, 10)
        }
    });

    if (!genre) {
        notFound(); // This will trigger the not-found.tsx page if you have one
    }

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar/>
            <div className="container mx-auto py-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Edit Genre</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EditGenreForm genre={genre}/>
                    </CardContent>
                </Card>
            </div>
        </div>
        );
        }