// app/genres/new/page.tsx
import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import GenreForm from './genre-form';

export default function NewGenrePage() {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto py-8">
                <Card className="bg-card border-border">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="text-foreground">Ajouter un Genre</CardTitle>
                        <CardDescription className="text-muted-foreground">
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