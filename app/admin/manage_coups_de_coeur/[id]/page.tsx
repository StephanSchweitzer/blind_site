'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import BookSelector from '../components/book-selector';
import AudioRecorder from '@/components/AudioRecorder';
import {useWarnIfUnsavedChanges} from "@/components/userWarnIfUnsavedChanges";

interface BookWithDetails {
    coupsDeCoeurId: number;
    bookId: number;
    book: {
        id: number;
        title: string;
        author: string;
        publishedDate: string;
        isbn: string | null;
        description: string | null;
        readingDurationMinutes: number | null;
        available: boolean;
        createdAt: string;
        updatedAt: string;
        addedById: number;
    };
}

interface CoupDeCoeur {
    id: number;
    title: string;
    description: string;
    audioPath: string;
    active: boolean;
    books: BookWithDetails[];
    addedById: number;
    createdAt: string;
    updatedAt: string;
}

export default function EditCoupDeCoeurPage() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<CoupDeCoeur | null>(null);
    const [originalData, setOriginalData] = useState<CoupDeCoeur | null>(null);
    const [bookMap, setBookMap] = useState<Record<number, BookWithDetails['book']>>({});
    const [tempAudioBlob, setTempAudioBlob] = useState<Blob | null>(null);
    const [isRerecording, setIsRerecording] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isBookSelectorOpen, setIsBookSelectorOpen] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const { NavigationWarningDialog } = useWarnIfUnsavedChanges({
        unsaved: hasUnsavedChanges,
        message: "Si vous souhaitez enregistrer ces modifications, cliquez sur le bouton " +
            "\n\n « Mettre à jour la liste de livres » \n\n " +
            "En bas à droite, sinon quittez la page."
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData!,
            [name]: value,
        }));
        setHasUnsavedChanges(true);
    };

    useEffect(() => {
        if (!formData || !originalData) return;

        const hasChanged =
            formData.title !== originalData.title ||
            formData.description !== originalData.description ||
            formData.active !== originalData.active ||
            tempAudioBlob !== null ||
            JSON.stringify(formData.books.map(b => b.book.id).sort()) !==
            JSON.stringify(originalData.books.map(b => b.book.id).sort());

        setHasUnsavedChanges(hasChanged);
    }, [formData, originalData, tempAudioBlob]);

    useEffect(() => {
        async function fetchCoupDeCoeur() {
            try {
                const res = await fetch(`/api/coups-de-coeur/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setFormData(data);
                    setOriginalData(data);
                    const initialBookMap = data.books.reduce((acc: Record<number, BookWithDetails['book']>, curr: BookWithDetails) => {
                        acc[curr.book.id] = curr.book;
                        return acc;
                    }, {});
                    setBookMap(initialBookMap);
                } else {
                    setError('Échec du chargement de la liste de livres');
                    router.push('/admin/manage_coups_de_coeur');
                }
            } catch (error) {
                setError('Erreur lors du chargement de la liste de livres' + error);
                router.push('/admin/manage_coups_de_coeur');
            }
        }

        if (id) {
            fetchCoupDeCoeur();
        }
    }, [id, router]);


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            let audioPath = formData!.audioPath;

            if (tempAudioBlob) {
                const timestamp = new Date().getTime();
                const filename = `coup_description_${timestamp}.mp3`;
                const audioFormData = new FormData();
                audioFormData.append('audio', tempAudioBlob, filename);

                const uploadRes = await fetch('/api/upload-audio', {
                    method: 'POST',
                    body: audioFormData,
                });

                if (!uploadRes.ok) throw new Error('Échec du téléchargement audio');
                const { filepath } = await uploadRes.json();
                audioPath = filepath;
            }

            const res = await fetch(`/api/coups-de-coeur/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData!.title,
                    description: formData!.description,
                    audioPath,
                    active: formData!.active,
                    bookIds: formData!.books.map(book => book.book.id)
                }),
            });

            if (res.ok) {
                setHasUnsavedChanges(false);
                await new Promise(resolve => requestAnimationFrame(resolve));

                router.push('/admin/manage_coups_de_coeur');
                router.refresh();
            } else {
                throw new Error('Échec de la mise à jour de la liste de livres');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Échec de la mise à jour de la liste de livres');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer cette liste de livres ?')) {
            try {
                const res = await fetch(`/api/coups-de-coeur/${id}`, {
                    method: 'DELETE',
                });

                if (res.ok) {
                    setHasUnsavedChanges(false);
                    router.push('/admin/manage_coups_de_coeur');
                    router.refresh();
                } else {
                    setError('Échec de la suppression de la liste de livres');
                }
            } catch (error) {
                console.error('Erreur lors de la suppression:', error);
                setError('Une erreur est survenue lors de la suppression.');
            }
        }
    };

    if (!formData) {
        return <div className="flex justify-center items-center min-h-screen">
            <p className="text-gray-200">Chargement...</p>
        </div>;
    }

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-gray-700">
                    <CardTitle className="text-gray-100">Modifier la liste de livres</CardTitle>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        className="bg-red-900 hover:bg-red-800 text-gray-100"
                    >
                        Supprimer
                    </Button>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <div className="grid gap-6">
                            <div className="space-y-2">
                                <label htmlFor="title" className="text-sm font-medium text-gray-200">
                                    Titre *
                                </label>
                                <Input
                                    type="text"
                                    name="title"
                                    id="title"
                                    required
                                    value={formData.title}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="description" className="text-sm font-medium text-gray-200">
                                    Description
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    value={formData.description || ""}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600 min-h-[150px]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Enregistrement Audio
                                </label>
                                {!isRerecording ? (
                                    <div className="space-y-2">
                                        <audio
                                            src={formData.audioPath}
                                            controls
                                            className="w-full bg-gray-800 rounded-md"
                                        />
                                        <Button
                                            type="button"
                                            onClick={() => setIsRerecording(true)}
                                            variant="outline"
                                            className="w-full bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                                        >
                                            Nouvel Enregistrement
                                        </Button>
                                    </div>
                                ) : (
                                    <AudioRecorder
                                        onConfirm={setTempAudioBlob}
                                        onClear={() => {
                                            setTempAudioBlob(null);
                                            setIsRerecording(false);
                                        }}
                                    />
                                )}
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="active"
                                    checked={formData.active}
                                    onCheckedChange={(checked: boolean) => {
                                        setFormData(prev => ({ ...prev!, active: checked }));
                                        setHasUnsavedChanges(true);
                                    }}
                                    className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-400"
                                />
                                <label htmlFor="active" className="text-sm font-medium text-gray-200">
                                    Cette liste de livres est-elle visible par le public ?
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label
                                    className="text-sm font-medium text-gray-200 cursor-pointer"
                                    onClick={() => {
                                        setIsBookSelectorOpen(true);
                                    }}
                                >
                                    Sélectionner les livres *
                                </label>
                                <BookSelector
                                    selectedBooks={formData.books.map(book => book.book.id)}
                                    onSelectedBooksChange={(bookIds: number[]) => {
                                        setFormData(prev => {
                                            if (!prev) return null;
                                            return {
                                                ...prev,
                                                books: bookIds.map(id => ({
                                                    coupsDeCoeurId: prev.id,
                                                    bookId: id,
                                                    book: bookMap[id] || {
                                                        id,
                                                        title: '',
                                                        author: '',
                                                        publishedDate: new Date().toISOString(),
                                                        isbn: null,
                                                        description: null,
                                                        readingDurationMinutes: null,
                                                        available: true,
                                                        createdAt: new Date().toISOString(),
                                                        updatedAt: new Date().toISOString(),
                                                        addedById: prev.addedById
                                                    }
                                                }))
                                            };
                                        });
                                        setHasUnsavedChanges(true);
                                    }}
                                    mode="edit"
                                    coupDeCoeurId={parseInt(id as string)}
                                    onDialogOpenChange={setIsBookSelectorOpen}
                                    isOpen={isBookSelectorOpen}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={async () => {
                                    await new Promise(resolve => {
                                        setHasUnsavedChanges(false);
                                        setTimeout(resolve, 0);
                                    });
                                    router.push('/admin/manage_coups_de_coeur');
                                    router.refresh();
                                }}
                                className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="submit"
                                disabled={isLoading || formData.books.length === 0}
                                className="bg-gray-700 hover:bg-gray-600 text-gray-100"
                            >
                                {isLoading ? 'Mise à jour...' : 'Mettre à jour la liste de livres '}
                            </Button>
                        </div>
                    </form>
                    <NavigationWarningDialog />
                </CardContent>
            </Card>
        </div>
    );
}