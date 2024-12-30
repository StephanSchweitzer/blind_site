'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Genre {
    id: number;
    name: string;
    description: string | null;
}

interface EditGenreFormProps {
    genre: Genre;
}

export default function EditGenreForm({ genre }: EditGenreFormProps) {
    const [name, setName] = useState(genre.name);
    const [description, setDescription] = useState(genre.description ?? '');
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

        try {
            const res = await fetch(`/api/genres/${genre.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update genre');
            }

            // Wait for navigation to complete before refreshing
            await router.push('/admin/genres');
            router.refresh();
        } catch (err) {
            console.error('Submit error:', err);
            setError(err instanceof Error ? err.message : 'Failed to update genre');
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
                <Label htmlFor="name">Name</Label>
                <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Genre name"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Genre description (optional)"
                />
            </div>
            <div className="flex gap-4">
                <Button
                    type="submit"
                    disabled={isLoading}
                >
                    {isLoading ? 'Updating...' : 'Update Genre'}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/admin/genres')}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}