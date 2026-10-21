'use client';

import React, { useState } from 'react';
import { IntentLink } from '@/components/admin/IntentLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2 } from 'lucide-react';
import { markToasted, useFormToast } from '@/hooks/useFormToast';
import { useConfirm } from '@/components/ui/confirm-dialog';

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
    const { toastFailure } = useFormToast();
    const confirm = useConfirm();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);

        try {
            const genreId = await onSubmit({
                name: formData.name.trim(),
                description: formData.description.trim(),
            });
            onSuccess?.(genreId);
        } catch (err) {
            toastFailure(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;
        if (!(await confirm({
            // Named: « Supprimer ce genre ? » left the permanent guessing which one.
            title: formData.name.trim() ? `Supprimer le genre « ${formData.name.trim()} » ?` : 'Supprimer ce genre ?',
            description: 'Cette action est irréversible.',
            confirmLabel: 'Supprimer',
            destructive: true,
        }))) return;

        setIsDeleting(true);
        try {
            await onDelete();
        } catch (err) {
            toastFailure(err, 'Suppression impossible');
        } finally {
            setIsDeleting(false);
        }
    };

    const busy = isLoading || isDeleting;

    return (
        <div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium text-foreground">
                            Nom *
                        </label>
                        <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                            required
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
                                    <IntentLink href={booksHref} className="underline underline-offset-2 hover:text-foreground">
                                        voir dans le catalogue
                                    </IntentLink>
                                </>
                            )}
                        </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <Button type="submit" disabled={busy} variant="save">
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
            </div>
    );
}

const apiError = (data: unknown, fallback: string): string => {
    const body = data as { error?: string; message?: string } | null;
    // `message` d'abord : c'est la phrase française pour le permanent, `error`
    // n'étant souvent qu'un code anglais (« Genre in use »).
    return body?.message || body?.error || fallback;
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
            toastError(message, 'Création impossible');
            throw markToasted(new Error(message));
        }

        toastSuccess('Genre créé');
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
            throw markToasted(new Error(message));
        }

        toastSuccess('Genre enregistré');
        return genreId;
    };

    const handleDelete = async () => {
        const res = await fetch(`/api/genres/${genreId}`, { method: 'DELETE' });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error(apiError(data, 'Échec de la suppression du genre'));
        }

        toastSuccess('Genre supprimé');
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
