'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

export default function EditArticle() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<any>(null);

    useEffect(() => {
        async function fetchArticle() {
            const res = await fetch(`/api/news/${id}`);
            const data = await res.json();
            setFormData(data);
        }
        fetchArticle();
    }, [id]);

    if (!formData) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <span className="text-gray-200">Chargement...</span>
            </div>
        );
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prevData: any) => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch(`/api/news/${id}`, {
            method: 'PUT',
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
                        <CardTitle className="text-gray-100">Modifier la dernière info</CardTitle>
                        <CardDescription className="text-gray-400">
                            Modifier l'informations de la dernière info
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
                                    Mettre à jour
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}