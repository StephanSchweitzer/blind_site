'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {Card, CardHeader, CardTitle, CardContent, CardDescription} from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Check, ChevronsUpDown, X, Loader2 } from "lucide-react";
import YearCommandSelect from "@/components/ui/year-select";
import DurationInputs from "@/components/ui/duration-inputs";


interface Genre {
    id: number;
    name: string;
    description?: string;
}

interface Livre {
    id: number;
    title: string;
    author: string;
    publisher: string | undefined;
    publishedYear: string;
    genres: { genre: Genre }[];
    isbn?: string;
    description?: string;
    readingDurationMinutes?: number;
    available: boolean;
}


export default function EditionLivre() {
    const router = useRouter();
    const params = useParams();
    const {id} = params;

    const [formData, setFormData] = useState<Livre | null>(null);
    const [genresDisponibles, setGenresDisponibles] = useState<Genre[]>([]);
    const [genresSelectionnes, setGenresSelectionnes] = useState<number[]>([]);
    const [open, setOpen] = useState(false);
    const [rechercheQuery, setRechercheQuery] = useState('');
    const [erreur, setErreur] = useState<string | null>(null);
    const [chargement, setChargement] = useState(false);
    const [suppressionEnCours, setSuppressionEnCours] = useState(false);

    // Récupérer les genres disponibles
    useEffect(() => {
        async function recupererGenres() {
            try {
                const res = await fetch('/api/genres');
                if (res.ok) {
                    const donnees = await res.json();
                    setGenresDisponibles(donnees);
                }
            } catch (erreur) {
                console.error('Erreur lors de la récupération des genres:', erreur); // Log detailed error for debugging
                setErreur('Échec de la récupération des genres');
            }
        }

        recupererGenres();
    }, []);

    useEffect(() => {
        async function recupererLivre() {
            try {
                const res = await fetch(`/api/books/${id}`);
                if (res.ok) {
                    const donnees = await res.json();
                    const date = new Date(donnees.publishedDate);

                    setFormData({
                        ...donnees,
                        publishedMonth: (date.getMonth() + 1).toString().padStart(2, '0'),
                        publishedYear: date.getFullYear().toString(),
                    });
                    setGenresSelectionnes(donnees.genres.map((g: { genre: Genre }) => g.genre.id));
                } else {
                    router.push('/admin/books');
                }
            } catch (erreur) {
                setErreur('Échec de la récupération du livre' + erreur);
                router.push('/admin/books');
            }
        }

        if (id) {
            recupererLivre();
        }
    }, [id, router]);

    const gererSelectionGenre = (genreId: number) => {
        setGenresSelectionnes(prev => {
            return prev.includes(genreId)
                ? prev.filter(id => id !== genreId)
                : [...prev, genreId];
        });
    };

    const supprimerGenre = (genreId: number) => {
        setGenresSelectionnes(prev => prev.filter(id => id !== genreId));
    };

    if (!formData) {
        return <div className="flex justify-center items-center min-h-screen">
            <p className="text-gray-200">Chargement...</p>
        </div>;
    }

    const gererChangement = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const {name, value} = e.target;
        const estCheckbox = e.target instanceof HTMLInputElement && e.target.type === 'checkbox';

        setFormData((prevData) => ({
            ...prevData!,
            [name]: estCheckbox ? (e.target as HTMLInputElement).checked : value,
        }));
    };

    const gererSoumission = async (e: React.FormEvent) => {
        e.preventDefault();
        setChargement(true);
        setErreur(null);

        try {
            // Créer une chaîne de date formatée (AAAA-MM-01)
            const dateFormatee = formData.publishedYear
                ? `${formData.publishedYear}-01-01`
                : null;

            const donneesSoumission = {
                ...formData,
                genres: genresSelectionnes,
                publishedDate: dateFormatee,
                readingDurationMinutes: formData.readingDurationMinutes
                    ? parseInt(formData.readingDurationMinutes.toString())
                    : null
            };

            const res = await fetch(`/api/books/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(donneesSoumission),
            });

            if (!res.ok) {
                throw new Error('Échec de la mise à jour du livre');
            }

            router.push('/admin/books');
            router.refresh();
        } catch (err) {
            setErreur(err instanceof Error ? err.message : 'Échec de la mise à jour du livre');
        } finally {
            setChargement(false);
        }
    };

    const gererSuppression = async () => {
        setSuppressionEnCours(true);
        setErreur(null);

        try {
            const res = await fetch(`/api/books/${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Échec de la suppression du livre');
            }

            router.push('/admin/books');
            router.refresh();
        } catch (err) {
            console.error('Delete error:', err);
            setErreur(err instanceof Error ? err.message : 'Échec de la suppression du livre');
            setSuppressionEnCours(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-700">
                    <CardTitle className="text-gray-100">Modifier le livre</CardTitle>
                    <CardDescription className="text-gray-400">
                        Modifier les détails du livre et les genres associés
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={gererSoumission} className="space-y-6">
                        {erreur && (
                            <Alert variant="destructive">
                                <AlertDescription>{erreur}</AlertDescription>
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
                                    onChange={gererChangement}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="author" className="text-sm font-medium text-gray-200">
                                    Auteur *
                                </label>
                                <Input
                                    type="text"
                                    name="author"
                                    id="author"
                                    required
                                    value={formData.author}
                                    onChange={gererChangement}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="publisher" className="text-sm font-medium text-gray-200">
                                    Éditeur *
                                </label>
                                <Input
                                    type="text"
                                    name="publisher"
                                    id="publisher"
                                    required
                                    value={formData.publisher || ''}
                                    onChange={gererChangement}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Année de publication *
                                    </label>
                                    <YearCommandSelect
                                        value={formData.publishedYear}
                                        onChange={(value: string) =>
                                            setFormData(prev => prev ? {...prev, publishedYear: value} : null)
                                        }
                                        startYear={1900}
                                        endYear={new Date().getFullYear()}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-200">
                                    Genres
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {genresSelectionnes.map(genreId => {
                                        const genre = genresDisponibles.find(g => g.id === genreId);
                                        return genre ? (
                                            <div
                                                key={genre.id}
                                                className="bg-gray-800 text-gray-200 rounded-full px-3 py-1 text-sm flex items-center border border-gray-700"
                                            >
                                                {genre.name}
                                                <button
                                                    type="button"
                                                    onClick={() => supprimerGenre(genre.id)}
                                                    className="ml-2 hover:text-gray-400"
                                                >
                                                    <X className="h-3 w-3"/>
                                                </button>
                                            </div>
                                        ) : null;
                                    })}
                                </div>
                                <Popover open={open} onOpenChange={setOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={open}
                                            className="w-full justify-between bg-gray-800 border-gray-100 text-gray-200 hover:bg-gray-700 hover:text-gray-100"
                                        >
                                            Sélectionner des genres...
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Rechercher des genres..."
                                                value={rechercheQuery}
                                                onChange={(e) => setRechercheQuery(e.target.value)}
                                                className="mb-2 bg-gray-700 border-gray-600 text-gray-100"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {genresDisponibles
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(rechercheQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-700 text-gray-200 rounded-sm cursor-pointer"
                                                            onClick={() => {
                                                                gererSelectionGenre(genre.id);
                                                                setRechercheQuery('');
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${
                                                                    genresSelectionnes.includes(genre.id)
                                                                        ? "opacity-100"
                                                                        : "opacity-0"
                                                                }`}
                                                            />
                                                            {genre.name}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="isbn" className="text-sm font-medium text-gray-200">
                                    ISBN
                                </label>
                                <Input
                                    type="text"
                                    name="isbn"
                                    id="isbn"
                                    value={formData.isbn || ''}
                                    onChange={gererChangement}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                />
                            </div>

                            <DurationInputs
                                formData={formData}
                                handleChange={gererChangement}  // Using your existing handler name 'gererChangement'
                            />


                            <div className="space-y-2">
                                <label htmlFor="description" className="text-sm font-medium text-gray-200">
                                    Description
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    value={formData.description || ''}
                                    onChange={gererChangement}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 min-h-[150px]"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="available"
                                    name="available"
                                    checked={formData.available}
                                    onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                            ...prev!,
                                            available: checked as boolean
                                        }));
                                    }}
                                    className="border-gray-700 data-[state=checked]:bg-gray-700"
                                />
                                <label htmlFor="available" className="text-sm font-medium text-gray-200">
                                    Disponible
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <Button
                                type="submit"
                                disabled={chargement || suppressionEnCours}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-100"
                            >
                                {chargement && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                {chargement ? 'Mise à jour en cours...' : 'Mettre à jour le livre'}
                            </Button>

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="destructive"
                                            disabled={chargement || suppressionEnCours}
                                            className="bg-red-900 hover:bg-red-800 text-red-200"
                                        >
                                            {suppressionEnCours && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                            {suppressionEnCours ? 'Suppression...' : 'Supprimer le livre'}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-gray-900 border-gray-800">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-gray-100">
                                                Confirmer la suppression
                                            </AlertDialogTitle>
                                            <AlertDialogDescription className="text-gray-400">
                                                Êtes-vous sûr de vouloir supprimer ce livre ? Cette action est
                                                irréversible.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel
                                                className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                                            >
                                                Annuler
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={gererSuppression}
                                                className="bg-red-900 hover:bg-red-800 text-red-200"
                                            >
                                                Supprimer
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                    </form>
                    s
                </CardContent>
            </Card>
        </div>
    );
}