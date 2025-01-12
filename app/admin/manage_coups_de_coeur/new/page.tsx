'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import BackendNavbar from '@/components/Backend-Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/custom-switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const [isBookSelectorOpen, setIsBookSelectorOpen] = useState(false);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prevData => ({
            ...prevData,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Starting form submission...', { formData, tempAudioBlob });

        if (!tempAudioBlob) {
            setError('Audio recording is required');
            return;
        }

        if (formData.bookIds.length === 0) {
            setError('Please select at least one book');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // First, upload the audio file
            const timestamp = new Date().getTime();
            const filename = `coup_description_${timestamp}.mp3`;
            const audioFormData = new FormData();
            audioFormData.append('audio', tempAudioBlob, filename);

            console.log('Uploading audio...', filename);
            const uploadRes = await fetch('/api/upload-audio', {
                method: 'POST',
                body: audioFormData,
            });

            if (!uploadRes.ok) {
                const uploadError = await uploadRes.json();
                throw new Error(`Failed to upload audio: ${uploadError.message || uploadRes.statusText}`);
            }

            const { filepath } = await uploadRes.json();
            console.log('Audio uploaded successfully:', filepath);

            // Then create the coup de coeur with the file path
            console.log('Creating coup de coeur...', {
                ...formData,
                audioPath: filepath,
            });

            const res = await fetch('/api/coups-de-coeur', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    audioPath: filepath,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`Failed to create coup de coeur: ${errorData.message || res.statusText}`);
            }

            console.log('Coup de coeur created successfully');
            router.push('/admin/manage_coups_de_coeur');
            router.refresh();
        } catch (err) {
            console.error('Error submitting form:', err);
            setError(err instanceof Error ? err.message : 'Failed to create coup de coeur');
        } finally {
            setIsLoading(false);
        }
    };

    return (
                <div className="space-y-4">
                    <Card className="bg-gray-900 border-gray-800">
                        <CardHeader className="border-b border-gray-700">
                            <CardTitle className="text-gray-100">Ajouter un nouveau coup de coeur</CardTitle>
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
                                            placeholder="Le titre principal de ce coup de cœur"

                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label htmlFor="description" className="text-sm font-medium text-gray-200">
                                            Description *
                                        </label>
                                        <Textarea
                                            name="description"
                                            id="description"
                                            required
                                            value={formData.description}
                                            onChange={handleChange}
                                            className="bg-gray-800 border-gray-700 text-gray-100 focus:ring-gray-700 focus:border-gray-600 placeholder:text-gray-400 min-h-[150px]"
                                            placeholder="Informations générales ajoutées en haut du coup de coeur"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-200">
                                            Enregistrement audio *
                                        </label>
                                        <div className="bg-gray-800 border border-gray-700 rounded-md p-4">
                                            <AudioRecorder
                                                onConfirm={setTempAudioBlob}
                                                onClear={() => setTempAudioBlob(null)}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-sm font-medium text-gray-200 cursor-pointer"
                                            onClick={() => {
                                                console.log('Label clicked');
                                                setIsBookSelectorOpen(true);
                                                console.log('isBookSelectorOpen set to:', true);
                                            }}
                                        >
                                            Sélectionner les livres *
                                        </label>
                                        <div className="bg-gray-800 border border-gray-700 rounded-md">
                                            <BookSelector
                                                selectedBooks={formData.bookIds}
                                                onSelectedBooksChange={(bookIds) =>
                                                    setFormData(prev => ({ ...prev, bookIds }))
                                                }
                                                mode="create"
                                                onDialogOpenChange={setIsBookSelectorOpen}
                                                isOpen={isBookSelectorOpen}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="active"
                                            checked={formData.active}
                                            onChange={(checked) =>
                                                setFormData(prev => ({...prev, active: checked}))
                                            }
                                        />
                                        <label htmlFor="active" className="text-sm font-medium text-gray-200">
                                            Actif
                                        </label>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || formData.bookIds.length === 0 || !tempAudioBlob}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100"
                                >
                                    {isLoading ? 'En ajoutant...' : 'Ajouter le coup de coeur'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
    );
}