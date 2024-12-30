'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, ChevronsUpDown, X } from "lucide-react";
import BackendNavbar from "@/components/Backend-Navbar";
import { useRouter } from 'next/navigation';

interface Genre {
    id: string;
    name: string;
}

export default function AddBook() {
    const [formData, setFormData] = useState({
        title: '',
        author: '',
        publishedDate: '',
        genres: [] as string[],
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

        try {
            const res = await fetch('/api/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            const data = await res.json();
            console.log('Response data:', data);

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create genre');
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
        <div className="min-h-screen bg-background">
            <BackendNavbar/>
            <div className="container mx-auto py-8">
                <div className="max-w-4xl mx-auto">
                    <Card>
                        <CardHeader>
                            <CardTitle>Add New Book</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}
                                <div>
                                    <label htmlFor="title" className="block text-sm font-medium">
                                        Title *
                                    </label>
                                    <Input
                                        type="text"
                                        name="title"
                                        id="title"
                                        required
                                        value={formData.title}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="author" className="block text-sm font-medium">
                                        Author *
                                    </label>
                                    <Input
                                        type="text"
                                        name="author"
                                        id="author"
                                        required
                                        value={formData.author}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="publishedDate" className="block text-sm font-medium">
                                        Published Date *
                                    </label>
                                    <Input
                                        type="date"
                                        name="publishedDate"
                                        id="publishedDate"
                                        required
                                        value={formData.publishedDate}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">
                                        Genres
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {formData.genres.map(genreId => {
                                            const genre = genres.find(g => g.id === genreId);
                                            return genre ? (
                                                <div
                                                    key={genre.id}
                                                    className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm flex items-center"
                                                >
                                                    {genre.name}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeGenre(genre.id)}
                                                        className="ml-2 hover:text-primary/80"
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
                                                className="w-full justify-between"
                                            >
                                                Select genres...
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-full p-0">
                                            <div className="p-2">
                                                <Input
                                                    placeholder="Search genres..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="mb-2"
                                                />
                                                <div className="max-h-60 overflow-y-auto">
                                                    {genres
                                                        .filter(genre =>
                                                            genre.name.toLowerCase().includes(searchQuery.toLowerCase())
                                                        )
                                                        .map((genre) => (
                                                            <div
                                                                key={genre.id}
                                                                className="flex items-center w-full px-2 py-1.5 text-sm hover:bg-primary/10 rounded-sm cursor-pointer"
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
                                <div>
                                    <label htmlFor="isbn" className="block text-sm font-medium">
                                        ISBN *
                                    </label>
                                    <Input
                                        type="text"
                                        name="isbn"
                                        id="isbn"
                                        required
                                        value={formData.isbn}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="readingDurationMinutes" className="block text-sm font-medium">
                                        Reading Duration (minutes)
                                    </label>
                                    <Input
                                        type="number"
                                        name="readingDurationMinutes"
                                        id="readingDurationMinutes"
                                        value={formData.readingDurationMinutes}
                                        onChange={handleChange}
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium">
                                        Description
                                    </label>
                                    <Textarea
                                        name="description"
                                        id="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div className="flex items-center">
                                    <Checkbox
                                        name="available"
                                        id="available"
                                        checked={formData.available}
                                        onChange={(event) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                available: event.target.checked
                                            }));
                                        }}
                                    />
                                    <label htmlFor="available" className="ml-2 text-sm font-medium">
                                        Available
                                    </label>
                                </div>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading ? 'Adding...' : 'Add Book'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}