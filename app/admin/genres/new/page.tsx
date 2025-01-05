// app/genres/new/page.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import GenreForm from './genre-form';

export default function NewGenrePage() {
    return (
        <div className="min-h-screen bg-gray-950">
            <div className="container mx-auto py-8">
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="border-b border-gray-700">
                        <CardTitle className="text-gray-100">Ajouter un Genre</CardTitle>
                        <CardDescription className="text-gray-400">
                            Créer un nouveau genre pour organiser vos livres
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <GenreForm />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}