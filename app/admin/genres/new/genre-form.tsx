// app/genres/new/genre-form.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function GenreForm() {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const payload = {
            name: name.trim(),
            description: description.trim(),
        };

        console.log('Sending payload:', payload);

        try {
            const res = await fetch('/api/genres', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            console.log('Response data:', data);

            if (!res.ok) {
                throw new Error(data.error || 'Failed to create genre');
            }

            router.push('/admin/genres');
            router.refresh();
        } catch (err) {
            console.error('Submit error:', err);
            setError(err instanceof Error ? err.message : 'Failed to create genre');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-200">Nom</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Nom du genre"
                    className="bg-gray-800 border-gray-100 text-gray-100 placeholder:text-gray-400"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-200">Description</Label>
                <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Description du genre (optionnel)"
                    className="bg-gray-800 border-gray-100 text-gray-100 placeholder:text-gray-400"
                />
            </div>
            <div className="flex gap-4">
                <Button
                    type="submit"
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isLoading ? 'Création...' : 'Créer le Genre'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/admin/genres')}
                    className="bg-gray-700 text-gray-200 border-gray-600 hover:bg-gray-600"
                >
                    Annuler
                </Button>
            </div>
        </form>
    );
}