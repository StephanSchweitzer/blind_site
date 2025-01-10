'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {Card, CardHeader, CardTitle, CardContent, CardDescription} from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, ChevronsUpDown, X } from "lucide-react";

interface Genre {
    id: number;
    name: string;
    description?: string;
}

interface Livre {
    id: number;
    title: string;
    author: string;
    publishedDate: string;
    publishedMonth: string;
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
    const { id } = params;

    const [formData, setFormData] = useState<Livre | null>(null);
    const [genresDisponibles, setGenresDisponibles] = useState<Genre[]>([]);
    const [genresSelectionnes, setGenresSelectionnes] = useState<number[]>([]);
    const [open, setOpen] = useState(false);
    const [rechercheQuery, setRechercheQuery] = useState('');
    const [erreur, setErreur] = useState<string | null>(null);
    const [chargement, setChargement] = useState(false);

    // Générer un tableau d'années
    const anneeActuelle = new Date().getFullYear();
    const annees = Array.from({ length: anneeActuelle - 1900 + 1 }, (_, i) => (anneeActuelle - i).toString());

    // Tableau des mois
    const mois = [
        { value: '01', label: 'janvier' },
        { value: '02', label: 'février' },
        { value: '03', label: 'mars' },
        { value: '04', label: 'avril' },
        { value: '05', label: 'mai' },
        { value: '06', label: 'juin' },
        { value: '07', label: 'juillet' },
        { value: '08', label: 'août' },
        { value: '09', label: 'septembre' },
        { value: '10', label: 'octobre' },
        { value: '11', label: 'novembre' },
        { value: '12', label: 'décembre' }
    ];

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
                setErreur('Échec de la récupération du livre');
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
        const { name, value } = e.target;
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
            const dateFormatee = formData.publishedYear && formData.publishedMonth
                ? `${formData.publishedYear}-${formData.publishedMonth}-01`
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
                headers: { 'Content-Type': 'application/json' },
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

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Mois de publication *
                                    </label>
                                    <Select
                                        value={formData.publishedMonth}
                                        onValueChange={(value) =>
                                            setFormData(prev => ({ ...prev!, publishedMonth: value }))
                                        }
                                    >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-100 border-gray-100">
                                            <SelectValue placeholder="Sélectionner un mois" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            {mois.map(mois => (
                                                <SelectItem
                                                    key={mois.value}
                                                    value={mois.value}
                                                    className="text-gray-100 hover:bg-gray-700 focus:bg-gray-700 focus:text-gray-100"
                                                >
                                                    {mois.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Année de publication *
                                    </label>
                                    <Select
                                        value={formData.publishedYear}
                                        onValueChange={(value) =>
                                            setFormData(prev => ({ ...prev!, publishedYear: value }))
                                        }
                                    >
                                        <SelectTrigger className="bg-gray-800 text-gray-100 border-gray-100">
                                            <SelectValue placeholder="Sélectionner une année" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[200px] overflow-y-auto bg-gray-800 border-gray-700">
                                            {annees.map(annee => (
                                                <SelectItem
                                                    key={annee}
                                                    value={annee}
                                                    className="text-gray-100 hover:bg-gray-700 focus:bg-gray-700 focus:text-gray-100"
                                                >
                                                    {annee}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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

                            <div className="space-y-2">
                                <label htmlFor="readingDurationMinutes" className="text-sm font-medium text-gray-200">
                                    Durée de lecture (minutes)
                                </label>
                                <Input
                                    type="number"
                                    name="readingDurationMinutes"
                                    id="readingDurationMinutes"
                                    value={formData.readingDurationMinutes || ''}
                                    onChange={gererChangement}
                                    min="0"
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                />
                            </div>

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

                        <Button
                            type="submit"
                            disabled={chargement}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100"
                        >
                            {chargement ? 'Mise à jour en cours...' : 'Mettre à jour le livre'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}