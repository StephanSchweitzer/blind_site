'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/custom-switch';
import BookSelector from '../components/book-selector';
import AudioRecorder from '@/components/AudioRecorder';

export default function AddCoupDeCoeur() {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        audioPath: '',
        active: true,
        bookIds: [] as number[]
    });
    const [tempAudioBlob, setTempAudioBlob] = useState<Blob | null>(null);
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tempAudioBlob) return;

        try {
            // First, upload the audio file
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

            // Then create the coup de coeur with the file path
            const res = await fetch('/api/coups-de-coeur', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    audioPath: filepath,
                }),
            });

            if (res.ok) {
                router.push('/admin/manage_coups_de_coeur');
                router.refresh();
            } else {
                const error = await res.json();
                console.error('Error creating coup de coeur:', error);
            }
        } catch (error) {
            console.error('Error submitting form:', error);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <BackendNavbar />
            <div className="container mx-auto py-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Add New Coup de Coeur</CardTitle>
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
                                <AudioRecorder
                                    onConfirm={setTempAudioBlob}
                                    onClear={() => setTempAudioBlob(null)}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Switch
                                    id="active"
                                    checked={formData.active}
                                    onChange={(checked) =>
                                        setFormData(prev => ({ ...prev, active: checked }))
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
                                    selectedBooks={formData.bookIds}
                                    onSelectedBooksChange={(bookIds) =>
                                        setFormData(prev => ({ ...prev, bookIds }))
                                    }
                                    mode="create"
                                />
                            </div>

                            <Button
                                type="submit"
                                className="mt-4"
                                disabled={formData.bookIds.length === 0 || !tempAudioBlob}
                            >
                                Create Coup de Coeur
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}