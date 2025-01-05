'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    publishedMonth: string;
    publishedYear: string;
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
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Generate array of years
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => (currentYear - i).toString());

    // Array of months
    const months = [
        { value: '01', label: 'janvier' },
        { value: '02', label: 'février' },
        { value: '03', label: 'mars' },
        { value: '04', label: 'avril' },
        { value: '05', label: 'mai' },
        { value: '06', label: 'juin' },
        { value: '07', label: 'juillet' },
        { value: '08', label: 'aout' },
        { value: '09', label: 'septembre' },
        { value: '10', label: 'octobre' },
        { value: '11', label: 'novembre' },
        { value: '12', label: 'décembre' }
    ];

    // Fetch available genres
    useEffect(() => {
        async function fetchGenres() {
            try {
                const res = await fetch('/api/genres');
                if (res.ok) {
                    const data = await res.json();
                    setAvailableGenres(data);
                }
            } catch (error) {
                setError('Failed to fetch genres');
            }
        }
        fetchGenres();
    }, []);

    useEffect(() => {
        async function fetchBook() {
            try {
                const res = await fetch(`/api/books/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    const date = new Date(data.publishedDate);

                    setFormData({
                        ...data,
                        publishedMonth: (date.getMonth() + 1).toString().padStart(2, '0'),
                        publishedYear: date.getFullYear().toString(),
                    });
                    setSelectedGenres(data.genres.map((g: { genre: Genre }) => g.genre.id));
                } else {
                    router.push('/admin/books');
                }
            } catch (error) {
                setError('Failed to fetch book');
                router.push('/admin/books');
            }
        }
        if (id) {
            fetchBook();
        }
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
        return <div className="flex justify-center items-center min-h-screen">
            <p className="text-gray-200">Loading...</p>
        </div>;
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
        setIsLoading(true);
        setError(null);

        try {
            // Create a formatted date string (YYYY-MM-01)
            const formattedDate = formData.publishedYear && formData.publishedMonth
                ? `${formData.publishedYear}-${formData.publishedMonth}-01`
                : null;

            const submitData = {
                ...formData,
                genres: selectedGenres,
                publishedDate: formattedDate,
                readingDurationMinutes: formData.readingDurationMinutes
                    ? parseInt(formData.readingDurationMinutes.toString())
                    : null
            };

            const res = await fetch(`/api/books/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitData),
            });

            if (!res.ok) {
                throw new Error('Failed to update book');
            }

            router.push('/admin/books');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update book');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="border-b border-gray-700">
                    <CardTitle className="text-gray-100">Edit Book</CardTitle>
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
                                    Title *
                                </label>
                                <Input
                                    type="text"
                                    name="title"
                                    id="title"
                                    required
                                    value={formData.title}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="author" className="text-sm font-medium text-gray-200">
                                    Author *
                                </label>
                                <Input
                                    type="text"
                                    name="author"
                                    id="author"
                                    required
                                    value={formData.author}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Published Month *
                                    </label>
                                    <Select
                                        value={formData.publishedMonth}
                                        onValueChange={(value) =>
                                            setFormData(prev => ({ ...prev!, publishedMonth: value }))
                                        }
                                    >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-100">
                                            <SelectValue placeholder="Select Month" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-gray-800 border-gray-700">
                                            {months.map(month => (
                                                <SelectItem
                                                    key={month.value}
                                                    value={month.value}
                                                    className="text-gray-100 hover:bg-gray-700 focus:bg-gray-700 focus:text-gray-100"
                                                >
                                                    {month.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-200">
                                        Published Year *
                                    </label>
                                    <Select
                                        value={formData.publishedYear}
                                        onValueChange={(value) =>
                                            setFormData(prev => ({ ...prev!, publishedYear: value }))
                                        }
                                    >
                                        <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-100">
                                            <SelectValue placeholder="Select Year" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[200px] overflow-y-auto bg-gray-800 border-gray-700">
                                            {years.map(year => (
                                                <SelectItem
                                                    key={year}
                                                    value={year}
                                                    className="text-gray-100 hover:bg-gray-700 focus:bg-gray-700 focus:text-gray-100"
                                                >
                                                    {year}
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
                                    {selectedGenres.map(genreId => {
                                        const genre = availableGenres.find(g => g.id === genreId);
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
                                            className="w-full justify-between bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700 hover:text-gray-100"
                                        >
                                            Select genres...
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0 bg-gray-800 border-gray-700">
                                        <div className="p-2">
                                            <Input
                                                placeholder="Search genres..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="mb-2 bg-gray-700 border-gray-600 text-gray-100"
                                            />
                                            <div className="max-h-60 overflow-y-auto">
                                                {availableGenres
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

                            <div className="space-y-2">
                                <label htmlFor="isbn" className="text-sm font-medium text-gray-200">
                                    ISBN
                                </label>
                                <Input
                                    type="text"
                                    name="isbn"
                                    id="isbn"
                                    value={formData.isbn || ''}
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="readingDurationMinutes" className="text-sm font-medium text-gray-200">
                                    Reading Duration (minutes)
                                </label>
                                <Input
                                    type="number"
                                    name="readingDurationMinutes"
                                    id="readingDurationMinutes"
                                    value={formData.readingDurationMinutes || ''}
                                    onChange={handleChange}
                                    min="0"
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600"
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
                                    onChange={handleChange}
                                    className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600 min-h-[150px]"
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
                                    Available
                                </label>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100"
                        >
                            {isLoading ? 'Updating...' : 'Update Book'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}