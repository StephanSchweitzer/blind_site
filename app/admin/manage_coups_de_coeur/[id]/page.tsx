'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import BookSelector from '../components/book-selector';
import AudioRecorder from '@/components/AudioRecorder';

interface BookWithDetails {
    coupsDeCoeurId: number;
    bookId: number;
    book: {
        id: number;
        title: string;
        author: string;
        publishedDate: string;
        isbn: string | null;
        description: string | null;
        readingDurationMinutes: number | null;
        available: boolean;
        createdAt: string;
        updatedAt: string;
        addedById: number;
    };
}

interface CoupDeCoeur {
    id: number;
    title: string;
    description: string;
    audioPath: string;
    active: boolean;
    books: BookWithDetails[];
    addedById: number;
    createdAt: string;
    updatedAt: string;
}

export default function EditCoupDeCoeurPage() {
    const router = useRouter();
    const params = useParams();
    const { id } = params;

    const [formData, setFormData] = useState<CoupDeCoeur | null>(null);
    const [bookMap, setBookMap] = useState<Record<number, BookWithDetails['book']>>({});
    const [tempAudioBlob, setTempAudioBlob] = useState<Blob | null>(null);
    const [isRerecording, setIsRerecording] = useState(false);

    useEffect(() => {
        async function fetchCoupDeCoeur() {
            try {
                const res = await fetch(`/api/coups-de-coeur/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setFormData(data);
                    const initialBookMap = data.books.reduce((acc: Record<number, BookWithDetails['book']>, curr: BookWithDetails) => {
                        acc[curr.book.id] = curr.book;
                        return acc;
                    }, {});
                    setBookMap(initialBookMap);
                } else {
                    console.error('Error fetching coup de coeur');
                    router.push('/admin/manage_coups_de_coeur');
                }
            } catch (error) {
                console.error('Error:', error);
                router.push('/admin/manage_coups_de_coeur');
            }
        }

        if (id) {
            fetchCoupDeCoeur();
        }
    }, [id, router]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData!,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            let audioPath = formData!.audioPath;

            if (tempAudioBlob) {
                const timestamp = new Date().getTime();
                const filename = `coup_description_${timestamp}.mp3`;
                const audioFormData = new FormData();
                audioFormData.append('audio', tempAudioBlob, filename);

                const uploadRes = await fetch('/api/upload-audio', {
                    method: 'POST',
                    body: audioFormData,
                });

                if (!uploadRes.ok) throw new Error('Failed to upload audio');
                const { filepath } = await uploadRes.json();
                audioPath = filepath;
            }

            const res = await fetch(`/api/coups-de-coeur/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData!.title,
                    description: formData!.description,
                    audioPath,
                    active: formData!.active,
                    bookIds: formData!.books.map(book => book.book.id)
                }),
            });

            if (res.ok) {
                router.push('/admin/manage_coups_de_coeur');
                router.refresh();
            } else {
                const error = await res.json();
                console.error('Error updating coup de coeur:', error);
            }
        } catch (error) {
            console.error('Error submitting form:', error);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Are you sure you want to delete this Coup de Coeur?')) {
            try {
                const res = await fetch(`/api/coups-de-coeur/${id}`, {
                    method: 'DELETE',
                });

                if (res.ok) {
                    router.push('/admin/manage_coups_de_coeur');
                    router.refresh();
                } else {
                    const error = await res.json();
                    console.error('Error deleting coup de coeur:', error);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
    };

    if (!formData) {
        return <div>Loading...</div>;
    }

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle>Edit Coup de Coeur</CardTitle>
                        <Button variant="destructive" onClick={handleDelete}>
                            Delete
                        </Button>
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
                                <label htmlFor="description" className="block text-sm font-medium">
                                    Description *
                                </label>
                                <Textarea
                                    name="description"
                                    id="description"
                                    required
                                    value={formData.description}
                                    onChange={handleChange}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium">
                                    Audio Recording *
                                </label>
                                {!isRerecording ? (
                                    <div className="space-y-2">
                                        <audio src={formData.audioPath} controls className="w-full" />
                                        <Button
                                            type="button"
                                            onClick={() => setIsRerecording(true)}
                                            variant="outline"
                                        >
                                            Record New Audio
                                        </Button>
                                    </div>
                                ) : (
                                    <AudioRecorder
                                        onConfirm={setTempAudioBlob}
                                        onClear={() => {
                                            setTempAudioBlob(null);
                                            setIsRerecording(false);
                                        }}
                                    />
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                <Switch
                                    id="active"
                                    checked={formData.active}
                                    onCheckedChange={(checked: boolean) =>
                                        setFormData(prev => ({ ...prev!, active: checked }))
                                    }
                                />
                                <label htmlFor="active" className="text-sm font-medium">
                                    Active
                                </label>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium">
                                    Select Books *
                                </label>
                                <BookSelector
                                    selectedBooks={formData.books.map(book => book.book.id)}
                                    onSelectedBooksChange={(bookIds: number[]) => {
                                        setFormData(prev => {
                                            if (!prev) return null;
                                            return {
                                                ...prev,
                                                books: bookIds.map(id => ({
                                                    coupsDeCoeurId: prev.id,
                                                    bookId: id,
                                                    book: bookMap[id] || {
                                                        id,
                                                        title: '',
                                                        author: '',
                                                        publishedDate: new Date().toISOString(),
                                                        isbn: null,
                                                        description: null,
                                                        readingDurationMinutes: null,
                                                        available: true,
                                                        createdAt: new Date().toISOString(),
                                                        updatedAt: new Date().toISOString(),
                                                        addedById: prev.addedById
                                                    }
                                                }))
                                            };
                                        });
                                    }}
                                    mode="edit"
                                    coupDeCoeurId={parseInt(id as string)}
                                />
                            </div>

                            <div className="flex justify-end gap-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => router.push('/admin/manage_coups_de_coeur')}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={formData.books.length === 0}
                                >
                                    Update Coup de Coeur
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}