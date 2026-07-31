'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useFormToast } from '@/hooks/useFormToast';

export interface GenreFormData {
    name: string;
    description: string;
}

interface GenreFormBackendBaseProps {
    initialData?: GenreFormData;
    onSubmit: (formData: GenreFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    onSuccess?: (genreId: number, isDeleted?: boolean) => void;
    onCancel?: () => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
    /** Books already carrying this genre — shown as a link to the filtered catalogue. */
    booksCount?: number;
    booksHref?: string;
}

const EMPTY_FORM: GenreFormData = { name: '', description: '' };

/**
 * The genre form, shared by the add and edit dialogues. Genres used to have
 * their own pair of pages; the back office now edits everything in place.
 */
export function GenreFormBackendBase({
    initialData,
    onSubmit,
    submitButtonText,
    loadingText,
    onSuccess,
    onCancel,
    onDelete,
    showDelete,
    booksCount,
    booksHref,
}: GenreFormBackendBaseProps) {
    const [formData, setFormData] = useState<GenreFormData>(initialData ?? EMPTY_FORM);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);
        setError(null);

        try {
            const genreId = await onSubmit({
                name: formData.name.trim(),
                description: formData.description.trim(),
            });
            onSuccess?.(genreId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Échec de l’enregistrement du genre';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce genre ? Cette action est irréversible.')) return;

        setIsDeleting(true);
        try {
            await onDelete();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Échec de la suppression du genre';
            setError(msg);
            toastError(msg);
        } finally {
            setIsDeleting(false);
        }
    };

    const busy = isLoading || isDeleting;

    return (
        <Card className="bg-card border-border">
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <Alert variant="destructive" className="border-red-300 bg-red-50 dark:border-red-500 dark:bg-red-900/20">
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <AlertTitle className="text-red-600 dark:text-red-400">Erreur</AlertTitle>
                            <AlertDescription className="text-foreground mt-1">{error}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium text-foreground">
                            Nom *
                        </label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                            required
                            placeholder="Nom du genre"
                            className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="description" className="text-sm font-medium text-foreground">
                            Description
                        </label>
                        <Input
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Description du genre (optionnel)"
                            className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                        />
                    </div>

                    {booksCount != null && booksHref && (
                        <p className="text-sm text-muted-foreground">
                            {booksCount === 0 ? (
                                'Aucun livre associé à ce genre.'
                            ) : (
                                <>
                                    {booksCount} livre{booksCount > 1 ? 's' : ''} associé
                                    {booksCount > 1 ? 's' : ''} —{' '}
                                    <Link href={booksHref} className="underline underline-offset-2 hover:text-foreground">
                                        voir dans le catalogue
                                    </Link>
                                </>
                            )}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLoading ? loadingText : submitButtonText}
                        </Button>
                        {onCancel && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={onCancel}
                                className="bg-muted text-foreground border-border hover:bg-accent"
                            >
                                Annuler
                            </Button>
                        )}
                        {showDelete && onDelete && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={handleDeleteClick}
                                className="ml-auto border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                            >
                                {isDeleting ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="mr-2 h-4 w-4" />
                                )}
                                {isDeleting ? 'Suppression...' : 'Supprimer le genre'}
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

const apiError = (data: unknown, fallback: string): string => {
    const body = data as { error?: string; message?: string } | null;
    return body?.error || body?.message || fallback;
};

export function AddGenreFormBackend({
    onSuccess,
    onCancel,
}: {
    onSuccess?: (genreId: number) => void;
    onCancel?: () => void;
}) {
    const { toastError, toastSuccess } = useFormToast();

    const handleSubmit = async (formData: GenreFormData): Promise<number> => {
        const res = await fetch('/api/genres', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const message = apiError(data, 'Échec de la création du genre');
            toastError(message);
            throw new Error(message);
        }

        toastSuccess('Le genre a été créé.');
        return data?.data?.id ?? 0;
    };

    return (
        <GenreFormBackendBase
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
            onCancel={onCancel}
            submitButtonText="Créer le genre"
            loadingText="Création..."
        />
    );
}

export function EditGenreFormBackend({
    genreId,
    initialData,
    booksCount,
    onSuccess,
    onCancel,
}: {
    genreId: number;
    initialData: GenreFormData;
    booksCount?: number;
    onSuccess?: (genreId: number, isDeleted?: boolean) => void;
    onCancel?: () => void;
}) {
    const { toastError, toastSuccess } = useFormToast();

    const handleSubmit = async (formData: GenreFormData): Promise<number> => {
        const res = await fetch(`/api/genres/${genreId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const message = apiError(data, 'Échec de la mise à jour du genre');
            toastError(message);
            throw new Error(message);
        }

        toastSuccess('Le genre a été mis à jour.');
        return genreId;
    };

    const handleDelete = async () => {
        const res = await fetch(`/api/genres/${genreId}`, { method: 'DELETE' });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error(apiError(data, 'Échec de la suppression du genre'));
        }

        toastSuccess('Le genre a été supprimé.');
        onSuccess?.(genreId, true);
    };

    return (
        <GenreFormBackendBase
            key={genreId}
            initialData={initialData}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
            onCancel={onCancel}
            onDelete={handleDelete}
            showDelete
            booksCount={booksCount}
            booksHref={`/admin/books?genres=${genreId}`}
            submitButtonText="Mettre à jour le genre"
            loadingText="Mise à jour..."
        />
    );
}
