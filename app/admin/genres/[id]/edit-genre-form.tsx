'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface Genre {
    id: number;
    name: string;
    description: string | null;
}

interface EditGenreFormProps {
    genre: Genre;
}

export default function EditGenreForm({ genre }: EditGenreFormProps) {
    const [name, setName] = useState(genre.name);
    const [description, setDescription] = useState(genre.description ?? '');
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleDelete = async () => {
        setIsDeleting(true);
        setError(null);

        try {
            const res = await fetch(`/api/genres/${genre.id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to delete genre');
            }

            router.push('/admin/genres');
            router.refresh();
        } catch (err) {
            console.error('Delete error:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete genre');
            setIsDeleting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const payload = {
            name: name.trim(),
            description: description.trim(),
        };

        try {
            const res = await fetch(`/api/genres/${genre.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update genre');
            }

            router.push('/admin/genres');
            router.refresh();
        } catch (err) {
            console.error('Submit error:', err);
            setError(err instanceof Error ? err.message : 'Failed to update genre');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-sm font-medium text-gray-200">
                                Nom
                            </Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                placeholder="Nom du genre"
                                className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-sm font-medium text-gray-200">
                                Description
                            </Label>
                            <Input
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Description du genre (optionnel)"
                                className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <Button
                            type="submit"
                            disabled={isLoading || isDeleting}
                            className="bg-gray-600 text-gray-200 border-gray-500 hover:bg-gray-500"
                        >
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? 'Mise à jour...' : 'Mettre à jour le genre'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.push('/admin/genres')}
                            disabled={isLoading || isDeleting}
                            className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                        >
                            Annuler
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={isLoading || isDeleting}
                                    className="ml-auto bg-red-900 hover:bg-red-800 text-red-200"
                                >
                                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {isDeleting ? 'Suppression...' : 'Supprimer le genre'}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-gray-900 border-gray-800">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-gray-100">
                                        Confirmer la suppression
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-gray-400">
                                        Êtes-vous sûr de vouloir supprimer ce genre ? Cette action est irréversible.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600">
                                        Annuler
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDelete}
                                        className="bg-red-900 hover:bg-red-800 text-red-200"
                                    >
                                        Supprimer
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}