'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, X } from "lucide-react";
import { useRouter } from 'next/navigation';
import BookSearch from "@/app/admin/books/components/book-search";
import YearCommandSelect from "@/components/ui/year-select";
import DurationInputs from "@/components/ui/duration-inputs";

interface Genre {
    id: string;
    name: string;
}

interface FormData {
    title: string;
    author: string;
    publishedYear: string;
    publishedMonth: string;
    genres: string[];
    isbn: string;
    description: string;
    available: boolean;
    readingDurationMinutes: string;
}

interface BookSearchData {
    title: string;
    author: string;
    description: string;
    isbn: string;
    publishedMonth: string;
    publishedYear: string;
}

export default function AddBook() {
    const [formData, setFormData] = useState<FormData>({
        title: '',
        author: '',
        publishedYear: '',
        publishedMonth: '',
        genres: [],
        isbn: '',
        description: '',
        available: true,
        readingDurationMinutes: '',
    });
    const [genres, setGenres] = useState<Genre[]>([]);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();


    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const response = await fetch('/api/genres');
                if (response.ok) {
                    const data = await response.json();
                    setGenres(data);
                }
            } catch (error) {
                setError('Failed to fetch genres');
            }
        };

        fetchGenres();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleBookSelect = (bookData: BookSearchData) => {
        setFormData(prev => ({
            ...prev,
            ...bookData
        }));
    };

    const handleGenreSelect = (genreId: string) => {
        setFormData(prevData => {
            const newGenres = prevData.genres.includes(genreId)
                ? prevData.genres.filter(id => id !== genreId)
                : [...prevData.genres, genreId];
            return {
                ...prevData,
                genres: newGenres,
            };
        });
    };

    const removeGenre = (genreId: string) => {
        setFormData(prevData => ({
            ...prevData,
            genres: prevData.genres.filter(id => id !== genreId),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formattedDate = formData.publishedYear && formData.publishedMonth
            ? `${formData.publishedYear}-01-01`
            : null;

        try {
            const res = await fetch('/api/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    publishedDate: formattedDate,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create book');
            }

            router.push('/admin/books');
            router.refresh();
        } catch (err) {
            console.error('Submit error:', err);
            setError(err instanceof Error ? err.message : 'Failed to add book');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-700">
                    <CardTitle className="text-gray-100">Ajouter un nouveau livre</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        <BookSearch onBookSelect={handleBookSelect} />

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
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Indiquer le titre du livre"
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
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Indiquer l'auteur du livre"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Année de publication *
                                    </label>
                                    <YearCommandSelect
                                        value={formData.publishedYear}
                                        onChange={(value) =>
                                            setFormData(prev => ({...prev, publishedYear: value}))
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
                                    {formData.genres.map(genreId => {
                                        const genre = genres.find(g => g.id === genreId);
                                        return genre ? (
                                            <div
                                                key={genre.id}
                                                className="bg-gray-800 text-gray-200 rounded-full px-3 py-1 text-sm flex items-center border border-gray-700"
                                            >
                                                {genre.name}
                                                <button
                                                    type="button"
                                                    onClick={() => removeGenre(genre.id)}
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
                                            Sélectionner les genres associés...
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Recherche de genres..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="mb-2 bg-gray-700 border-gray-600 text-gray-100"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {genres
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(searchQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-gray-700 text-gray-200 rounded-sm cursor-pointer"
                                                            onClick={() => {
                                                                handleGenreSelect(genre.id);
                                                                setSearchQuery('');
                                                            }}
                                                        >
                                                            <Check
                                                                className={`mr-2 h-4 w-4 ${
                                                                    formData.genres.includes(genre.id)
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
                                    required
                                    value={formData.isbn}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400"
                                    placeholder="Indiquer le numéro ISBN du livre (facultatif)"
                                />
                            </div>

                            <DurationInputs formData={formData} handleChange={handleChange} />


                            <div className="space-y-2">
                                <label htmlFor="description" className="text-sm font-medium text-gray-200">
                                    Description
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-100 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400 min-h-[150px]"
                                    placeholder="Décrire le livre pour aider les utilisateurs à comprendre de quoi il s'agit."
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    name="available"
                                    id="available"
                                    checked={formData.available}
                                    onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                            ...prev,
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
                            disabled={isLoading}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 border-gray-100"
                        >
                            {isLoading ? 'En ajoutant...' : 'Ajouter le livre'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}