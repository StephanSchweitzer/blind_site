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
    publisher: string | undefined;
    title: string;
    author: string;
    publishedYear: string;
    genres: string[];
    isbn: string | undefined;
    description: string | undefined;
    available: boolean;
    readingDurationMinutes: number | undefined;
}

interface BookSearchData {
    title: string;
    author: string;
    description: string;
    isbn: string | undefined;
    publishedMonth: string;
    publishedYear: string;
}

export default function AddBook() {
    const [formData, setFormData] = useState<FormData>({
        title: '',
        author: '',
        publisher: '',
        publishedYear: '',
        genres: [],
        isbn: '',
        description: '',
        available: true,
        readingDurationMinutes: 0,
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
                setError('Failed to fetch genres ' + error);
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

        const formattedDate = formData.publishedYear
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
            <Card className="bg-card border-border">
                <CardHeader className="border-b border-border">
                    <CardTitle className="text-foreground">Ajouter un nouveau livre</CardTitle>
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
                                <label htmlFor="title" className="text-sm font-medium text-foreground">
                                    Titre *
                                </label>
                                <Input
                                    type="text"
                                    name="title"
                                    id="title"
                                    required
                                    value={formData.title}
                                    onChange={handleChange}
                                    className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Indiquer le titre du livre"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="author" className="text-sm font-medium text-foreground">
                                    Auteur *
                                </label>
                                <Input
                                    type="text"
                                    name="author"
                                    id="author"
                                    required
                                    value={formData.author}
                                    onChange={handleChange}
                                    className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Indiquer l'auteur du livre"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="publisher" className="text-sm font-medium text-foreground">
                                    Éditeur
                                </label>
                                <Input
                                    type="text"
                                    name="publisher"
                                    id="publisher"
                                    value={formData.publisher || ''}
                                    onChange={handleChange}
                                    className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Indiquer l'éditeur du livre"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">
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
                                <label className="text-sm font-medium text-foreground">
                                    Genres
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {formData.genres.map(genreId => {
                                        const genre = genres.find(g => g.id === genreId);
                                        return genre ? (
                                            <div
                                                key={genre.id}
                                                className="bg-card text-foreground rounded-full px-3 py-1 text-sm flex items-center border border-border"
                                            >
                                                {genre.name}
                                                <button
                                                    type="button"
                                                    onClick={() => removeGenre(genre.id)}
                                                    className="ml-2 hover:text-muted-foreground"
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
                                            className="w-full justify-between bg-card border-border text-foreground hover:bg-muted hover:text-foreground"
                                        >
                                            Sélectionner les genres associés...
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0 bg-card border-border">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Recherche de genres..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="mb-2 bg-muted border-border text-foreground"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {genres
                                                    .filter(genre =>
                                                        genre.name.toLowerCase().includes(searchQuery.toLowerCase())
                                                    )
                                                    .map((genre) => (
                                                        <div
                                                            key={genre.id}
                                                            className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-muted text-foreground rounded-sm cursor-pointer"
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
                                <label htmlFor="isbn" className="text-sm font-medium text-foreground">
                                    ISBN
                                </label>
                                <Input
                                    type="text"
                                    name="isbn"
                                    id="isbn"
                                    value={formData.isbn}
                                    onChange={handleChange}
                                    className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                                    placeholder="Indiquer le numéro ISBN du livre (facultatif)"
                                />
                            </div>

                            <DurationInputs formData={formData} handleChange={handleChange}/>


                            <div className="space-y-2">
                                <label htmlFor="description" className="text-sm font-medium text-foreground">
                                    Description
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    value={formData.description}
                                    onChange={handleChange}
                                    className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground min-h-[150px]"
                                    placeholder="Décrire le livre pour aider les gens à comprendre de quoi il s'agit."
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
                                    className="border-border data-[state=checked]:bg-muted"
                                />
                                <label htmlFor="available" className="text-sm font-medium text-foreground">
                                    Disponible
                                </label>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-muted hover:bg-muted text-foreground border-border"
                        >
                            {isLoading ? 'En ajoutant...' : 'Ajouter le livre'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}