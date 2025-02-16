'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BookSelector from '../components/book-selector';
import AudioRecorder from '@/components/AudioRecorder';
//import { usePathname } from 'next/navigation';


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
    //const pathname = usePathname();
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
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
    const [exitWarningTitle, setExitWarningTitle] = useState("Modifications non sauvegardées");
    const [exitWarningMessage, setExitWarningMessage] = useState(
        "Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter cette page ?"
    );

    useEffect(() => {
        if (hasUnsavedChanges) {
            const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                const message = "Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter cette page ?";
                e.preventDefault();
                e.returnValue = message;
                return message;
            };

            const handleNavigation = () => {
                setPendingNavigation(window.location.pathname);
                setExitWarningTitle("Modifications non sauvegardées");
                setExitWarningMessage("Vous avez des modifications non sauvegardées. Voulez-vous vraiment quitter cette page ?");
                setShowExitDialog(true);
                return false;
            };

            window.addEventListener('beforeunload', handleBeforeUnload);
            window.onpopstate = handleNavigation;

            return () => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
                window.onpopstate = null;
            };
        }
    }, [hasUnsavedChanges]);

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

    const preventNavigation = useCallback(
        async (callback?: () => void) => {
            if (hasUnsavedChanges) {
                setShowExitDialog(true);
                if (callback) {
                    //setPendingNavigation(() => callback);
                }
                return false;
            }
            if (callback) {
                callback();
            }
            return true;
        },
        [hasUnsavedChanges]
    );

    useEffect(() => {
        if (hasUnsavedChanges) {
            const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                e.preventDefault();
                e.returnValue = '';
                return '';
            };

            const handlePopState = (e: PopStateEvent) => {
                e.preventDefault();
                preventNavigation(() => window.history.go(-1));
            };

            window.addEventListener('beforeunload', handleBeforeUnload);
            window.addEventListener('popstate', handlePopState);

            return () => {
                window.removeEventListener('beforeunload', handleBeforeUnload);
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, [hasUnsavedChanges, preventNavigation]);


    const handleNavigation = useCallback((path: string) => {
        preventNavigation(() => router.push(path));
    }, [preventNavigation, router]);

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
                    setError('Échec du chargement du coup de cœur');
                    router.push('/admin/manage_coups_de_coeur');
                }
            } catch (error) {
                setError('Erreur lors du chargement du coup de cœur ' + error);
                router.push('/admin/manage_coups_de_coeur');
            }
        }

        if (id) {
            fetchCoupDeCoeur();
        }
    }, [id, router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData!,
            [name]: value,
        }));
        setHasUnsavedChanges(true);
    };

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
                router.push('/admin/manage_coups_de_coeur');
                router.refresh();
            } else {
                throw new Error('Échec de la mise à jour du coup de cœur');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Échec de la mise à jour du coup de cœur');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer ce coup de cœur ?')) {
            try {
                const res = await fetch(`/api/coups-de-coeur/${id}`, {
                    method: 'DELETE',
                });

                if (res.ok) {
                    setHasUnsavedChanges(false);
                    router.push('/admin/manage_coups_de_coeur');
                    router.refresh();
                } else {
                    setError('Échec de la suppression du coup de cœur');
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
            <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
                <AlertDialogContent className="bg-gray-900 border-gray-700">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-gray-100">{exitWarningTitle}</AlertDialogTitle>
                        <AlertDialogDescription className="text-gray-300">
                            {exitWarningMessage}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-gray-800 text-gray-100 border-gray-700 hover:bg-gray-700"
                            onClick={() => {
                                setShowExitDialog(false);
                                setPendingNavigation(null);
                            }}
                        >
                            Rester sur la page
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-900 hover:bg-red-800 text-gray-100"
                            onClick={() => {
                                if (pendingNavigation) {
                                    setHasUnsavedChanges(false);
                                    if (pendingNavigation.startsWith(window.location.origin)) {
                                        const path = pendingNavigation.replace(window.location.origin, '');
                                        router.push(path);
                                    } else {
                                        window.location.href = pendingNavigation;
                                    }
                                }
                            }}
                        >
                            Quitter sans sauvegarder
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-gray-700">
                    <CardTitle className="text-gray-100">Modifier le Coup de Cœur</CardTitle>
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
                                    Ce coup de cœur est-il visible par le public ?
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
                                onClick={() => handleNavigation('/admin/manage_coups_de_coeur')}
                                className="bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700"
                            >
                                Annuler
                            </Button>
                            <Button
                                type="submit"
                                disabled={isLoading || formData.books.length === 0}
                                className="bg-gray-700 hover:bg-gray-600 text-gray-100"
                            >
                                {isLoading ? 'Mise à jour...' : 'Mettre à jour le Coup de Cœur'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}