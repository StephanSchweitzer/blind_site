'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {NewsType, newsTypeLabels} from '@/types/news';
import type { NewsPost } from '@/types/news';
import { Trash2 } from 'lucide-react';

export default function EditArticle() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<NewsPost | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchArticle() {
            try {
                const res = await fetch(`/api/news/${id}`);
                if (!res.ok) {
                    throw new Error('Failed to fetch article');
                }
                const data = await res.json();
                setFormData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchArticle();
    }, [id]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <span className="text-gray-200">Chargement...</span>
            </div>
        );
    }

    if (error || !formData) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <span className="text-red-400">{error || 'Article non trouvé'}</span>
            </div>
        );
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prevData) => ({
            ...prevData!,
            [name]: value,
        }));
    };

    const handleTypeChange = (value: NewsType) => {
        setFormData((prevData) => {
            if (!prevData) return null;
            return {
                ...prevData,
                type: value,
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/news/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Une erreur est survenue');
            }

            router.push('/admin/news');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/news/${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Une erreur est survenue lors de la suppression');
            }

            router.push('/admin/news');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la suppression');
            setIsDeleting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <div className="container mx-auto py-8">
                <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="border-b border-gray-700">
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle className="text-gray-100">Modifier la dernière info</CardTitle>
                                <CardDescription className="text-gray-400">
                                    Modifier l&apos;information de la dernière info
                                </CardDescription>
                            </div>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="bg-red-900/20 text-red-400 border-red-800 hover:bg-red-900/40 hover:text-red-300"
                                        disabled={isDeleting}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Supprimer
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-gray-900 border-gray-700">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-gray-100">
                                            Êtes-vous sûr de vouloir supprimer cet article ?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription className="text-gray-400">
                                            Cette action est irréversible. L&apos;article &quot;{formData.title}&quot; sera définitivement supprimé de la base de données.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600">
                                            Annuler
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                            onClick={handleDelete}
                                            disabled={isDeleting}
                                            className="bg-red-600 text-white hover:bg-red-700"
                                        >
                                            {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
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
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Entrez le titre de l'article"
                                />
                            </div>

                            <div>
                                <label htmlFor="type" className="block text-sm font-medium text-gray-200 mb-2">
                                    Type d&apos;information *
                                </label>
                                <Select
                                    value={formData.type}
                                    onValueChange={handleTypeChange}
                                >
                                    <SelectTrigger className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400">
                                        <SelectValue placeholder="Sélectionnez le type" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gray-800 border-gray-700">
                                        {Object.entries(newsTypeLabels).map(([value, label]) => (
                                            <SelectItem
                                                key={value}
                                                value={value}
                                                className="text-gray-100 focus:bg-gray-700 focus:text-gray-100"
                                            >
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400 min-h-[200px]"
                                    placeholder="Entrez le contenu de l'article"
                                />
                            </div>

                            {error && (
                                <div className="text-red-400 text-sm mt-2">
                                    {error}
                                </div>
                            )}

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