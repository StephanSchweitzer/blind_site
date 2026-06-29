'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
            console.warn('No audio provided, continuing without it.');
        }

        if (formData.bookIds.length === 0) {
            setError('Please select at least one book');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            let audioFilePath = '';

            if (tempAudioBlob) {
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
                audioFilePath = filepath;
            }


            const res = await fetch('/api/coups-de-coeur', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    description: formData.description || undefined,
                    audioPath: audioFilePath || undefined,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(`Failed to create la liste de livres: ${errorData.message || res.statusText}`);
            }

            console.log('Liste de livres created successfully');
            router.push('/admin/manage_coups_de_coeur');
            router.refresh();
        } catch (err) {
            console.error('Error submitting form:', err);
            setError(err instanceof Error ? err.message : 'Failed to create la liste de livres');
        } finally {
            setIsLoading(false);
        }
    };

    return (
                <div className="space-y-4">
                    <Card className="bg-card border-border">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-foreground">Ajouter une nouvelle liste de livres</CardTitle>
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
                                            placeholder="Le titre principal de cette liste de livres"

                                        />
                                    </div>

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
                                            placeholder="Informations générales ajoutées en haut de la liste de livres"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-foreground">
                                            Enregistrement audio
                                        </label>
                                        <AudioRecorder
                                            onConfirm={setTempAudioBlob}
                                            onClear={() => setTempAudioBlob(null)}
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="active"
                                            checked={formData.active}
                                            onChange={(checked) =>
                                                setFormData(prev => ({...prev, active: checked}))
                                            }
                                        />
                                        <label htmlFor="active" className="text-sm font-medium text-foreground">
                                            Cette liste de livres est-elle visible par le public ?
                                        </label>
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-sm font-medium text-foreground cursor-pointer"
                                            onClick={() => {
                                                setIsBookSelectorOpen(true);
                                            }}
                                        >
                                            Sélectionner les livres *
                                        </label>
                                        <div className="bg-card border border-border rounded-md">
                                            <BookSelector
                                                selectedBooks={formData.bookIds}
                                                onSelectedBooksChange={(bookIds) =>
                                                    setFormData(prev => ({...prev, bookIds}))
                                                }
                                                mode="create"
                                                onDialogOpenChange={setIsBookSelectorOpen}
                                                isOpen={isBookSelectorOpen}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isLoading || formData.bookIds.length === 0}
                                    className="w-full bg-muted hover:bg-muted text-foreground"
                                >
                                    {isLoading ? 'En ajoutant...' : 'Ajouter la liste de livres'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
    );
}