'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, X } from "lucide-react";

interface Genre {
    id: number;
    name: string;
    description?: string;
}

interface Book {
    id: number;
    title: string;
    author: string;
    publishedDate: string;
    genres: { genre: Genre }[];
    isbn?: string;
    description?: string;
    readingDurationMinutes?: number;
    available: boolean;
}

export default function EditBook() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<Book | null>(null);
    const [availableGenres, setAvailableGenres] = useState<Genre[]>([]);
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch available genres
    useEffect(() => {
        async function fetchGenres() {
            const res = await fetch('/api/genres');
            if (res.ok) {
                const data = await res.json();
                setAvailableGenres(data);
            }
        }
        fetchGenres();
    }, []);

    useEffect(() => {
        async function fetchBook() {
            const res = await fetch(`/api/books/${id}`);
            if (res.ok) {
                const data = await res.json();
                setFormData({
                    ...data,
                    publishedDate: data.publishedDate ? data.publishedDate.split('T')[0] : '',
                });
                // Set initially selected genres
                setSelectedGenres(data.genres.map((g: { genre: Genre }) => g.genre.id));
            } else {
                router.push('/books');
            }
        }
        fetchBook();
    }, [id, router]);

    const handleGenreSelect = (genreId: number) => {
        setSelectedGenres(prev => {
            return prev.includes(genreId)
                ? prev.filter(id => id !== genreId)
                : [...prev, genreId];
        });
    };

    const removeGenre = (genreId: number) => {
        setSelectedGenres(prev => prev.filter(id => id !== genreId));
    };

    if (!formData) {
        return <div>Loading...</div>;
    }

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        const isCheckbox = e.target instanceof HTMLInputElement && e.target.type === 'checkbox';

        setFormData((prevData) => ({
            ...prevData!,
            [name]: isCheckbox ? (e.target as HTMLInputElement).checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const submitData = {
            ...formData,
            genres: selectedGenres,
            readingDurationMinutes: formData.readingDurationMinutes
                ? parseInt(formData.readingDurationMinutes.toString())
                : null
        };

        const res = await fetch(`/api/books/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitData),
        });

        if (res.ok) {
            router.push('/books');
        } else {
            // Handle error
            console.error('Failed to update book');
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Edit Book</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Title */}
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

                            {/* Author */}
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

                            {/* Published Date */}
                            <div>
                                <label htmlFor="publishedDate" className="block text-sm font-medium">
                                    Published Date
                                </label>
                                <Input
                                    type="date"
                                    name="publishedDate"
                                    id="publishedDate"
                                    value={formData.publishedDate}
                                    onChange={handleChange}
                                />
                            </div>

                            {/* Genres */}
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Genres
                                </label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {selectedGenres.map(genreId => {
                                        const genre = availableGenres.find(g => g.id === genreId);
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
                                                {availableGenres
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
                                                                    selectedGenres.includes(genre.id)
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

                            {/* Reading Duration */}
                            <div>
                                <label htmlFor="readingDurationMinutes" className="block text-sm font-medium">
                                    Reading Duration (minutes)
                                </label>
                                <Input
                                    type="number"
                                    name="readingDurationMinutes"
                                    id="readingDurationMinutes"
                                    value={formData.readingDurationMinutes || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            {/* ISBN */}
                            <div>
                                <label htmlFor="isbn" className="block text-sm font-medium">
                                    ISBN
                                </label>
                                <Input
                                    type="text"
                                    name="isbn"
                                    id="isbn"
                                    value={formData.isbn || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label htmlFor="description" className="block text-sm font-medium">
                                    Description
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    value={formData.description || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            {/* Available */}
                            <div className="flex items-center">
                                <Checkbox
                                    id="available"
                                    name="available"
                                    checked={formData.available}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                        setFormData(prev => ({
                                            ...prev!,
                                            available: e.target.checked
                                        }));
                                    }}
                                />
                                <label htmlFor="available" className="ml-2 text-sm font-medium">
                                    Available
                                </label>
                            </div>

                            <Button type="submit" className="mt-4">
                                Update Book
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}