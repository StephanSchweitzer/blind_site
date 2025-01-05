'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

export default function AddArticle() {
    const [formData, setFormData] = useState({
        title: '',
        content: '',
    });
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        if (res.ok) {
            router.push('/admin/news');
        } else {
            // Gérer l'erreur
        }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <div className="container mx-auto py-8">
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="border-b border-gray-700">
                        <CardTitle className="text-gray-100">Ajouter un information</CardTitle>
                        <CardDescription className="text-gray-400">
                            Ajouter un information à afficher sur dernière info
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="title" className="block text-sm font-medium text-gray-200 mb-2">
                                    Titre *
                                </label>
                                <Input
                                    type="text"
                                    name="title"
                                    id="title"
                                    required
                                    value={formData.title}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                                    placeholder="Entrez le titre de l'article"
                                />
                            </div>
                            <div>
                                <label htmlFor="content" className="block text-sm font-medium text-gray-200 mb-2">
                                    Contenu *
                                </label>
                                <Textarea
                                    name="content"
                                    id="content"
                                    required
                                    value={formData.content}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600 min-h-[200px]"
                                    placeholder="Entrez le contenu de l'article"
                                />
                            </div>
                            <div className="flex justify-end space-x-4 pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                    onClick={() => router.push('/admin/news')}
                                >
                                    Annuler
                                </Button>
                                <Button
                                    type="submit"
                                    className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500"
                                >
                                    Ajouter l'information
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}