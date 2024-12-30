// app/genres/new/page.tsx
import React from 'react';
import BackendNavbar from '@/components/Backend-Navbar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import GenreForm from './genre-form';

export default function NewGenrePage() {
    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Add New Genre</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <GenreForm />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}