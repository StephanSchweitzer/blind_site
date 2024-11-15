// app/books/new/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function AddBook() {
    const [formData, setFormData] = useState({
        title: '',
        author: '',
        publishedDate: '',
        genre: '',
        isbn: '',
        description: '',
        available: true,
    });
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/books', {
            method: 'POST',
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
                        <CardTitle>Add New Book</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                                <label htmlFor="genre" className="block text-sm font-medium">
                                    Genre
                                </label>
                                <Input
                                    type="text"
                                    name="genre"
                                    id="genre"
                                    value={formData.genre}
                                    onChange={handleChange}
                                />
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
                                    onChange={handleChange}
                                />
                                <label htmlFor="available" className="ml-2 text-sm font-medium">
                                    Available
                                </label>
                            </div>
                            <Button type="submit" className="mt-4">
                                Add Book
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
