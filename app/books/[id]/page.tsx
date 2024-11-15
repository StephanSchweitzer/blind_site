// app/books/[id]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface Book {
    id: number;
    title: string;
    author: string;
    publishedDate: string;
    genre?: string | null;
    isbn: string;
    description?: string | null;
    available: boolean;
}

export default function EditBook() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<Book | null>(null);

    useEffect(() => {
        async function fetchBook() {
            const res = await fetch(`/api/books/${id}`);
            if (res.ok) {
                const data = await res.json();
                setFormData({
                    ...data,
                    publishedDate: data.publishedDate.split('T')[0],
                });
            } else {
                // Handle error, e.g., book not found
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
        const res = await fetch(`/api/books/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        if (res.ok) {
            router.push('/books');
        } else {
            // Handle error
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
                                <label
                                    htmlFor="publishedDate"
                                    className="block text-sm font-medium"
                                >
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
                            {/* Genre */}
                            <div>
                                <label htmlFor="genre" className="block text-sm font-medium">
                                    Genre
                                </label>
                                <Input
                                    type="text"
                                    name="genre"
                                    id="genre"
                                    value={formData.genre || ''}
                                    onChange={handleChange}
                                />
                            </div>
                            {/* ISBN */}
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
                            {/* Description */}
                            <div>
                                <label
                                    htmlFor="description"
                                    className="block text-sm font-medium"
                                >
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
                                    name="available"
                                    id="available"
                                    checked={formData.available}
                                    onChange={handleChange}
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
