'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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

    if (!formData) {
        return <div>Loading...</div>;
    }

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value, type, checked } = e.target;
        setFormData((prevData) => ({
            ...prevData!,
            [name]: type === 'checkbox' ? checked : value,
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
            <Navbar />
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
                                <div className="flex flex-wrap gap-2">
                                    {availableGenres.map((genre) => (
                                        <div key={genre.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`genre-${genre.id}`}
                                                checked={selectedGenres.includes(genre.id)}
                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                                    if (e.target.checked) {
                                                        setSelectedGenres(prev => [...prev, genre.id]);
                                                    } else {
                                                        setSelectedGenres(prev =>
                                                            prev.filter(id => id !== genre.id)
                                                        );
                                                    }
                                                }}
                                            />
                                            <label
                                                htmlFor={`genre-${genre.id}`}
                                                className="text-sm"
                                            >
                                                {genre.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
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