'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useFormToast } from '@/hooks/useFormToast';
import { newsTypeLabels, type NewsType } from '@/types/news';

export interface NewsFormData {
    title: string;
    content: string;
    type: NewsType;
}

interface NewsFormBackendBaseProps {
    initialData?: NewsFormData;
    onSubmit: (formData: NewsFormData) => Promise<number>;
    submitButtonText: string;
    loadingText: string;
    onSuccess?: (newsId: number, isDeleted?: boolean) => void;
    onCancel?: () => void;
    onDelete?: () => Promise<void>;
    showDelete?: boolean;
}

const EMPTY_FORM: NewsFormData = { title: '', content: '', type: 'GENERAL' };

/**
 * The Dernières infos form, shared by the add and edit dialogues — same shape as
 * the book / facture / attribution forms, so the back office has one way of
 * editing things rather than one per entity.
 */
export function NewsFormBackendBase({
    initialData,
    onSubmit,
    submitButtonText,
    loadingText,
    onSuccess,
    onCancel,
    onDelete,
    showDelete,
}: NewsFormBackendBaseProps) {
    const [formData, setFormData] = useState<NewsFormData>(initialData ?? EMPTY_FORM);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toastError } = useFormToast();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);
        setError(null);

        try {
            const newsId = await onSubmit(formData);
            onSuccess?.(newsId);
        } catch (err) {
            // The wrapper already toasts the detailed error; inline only here.
            const msg = err instanceof Error ? err.message : 'Échec de l’enregistrement de l’information';
            setError(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;
        if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette information ?')) return;

        setIsDeleting(true);
        try {
            await onDelete();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Échec de la suppression';
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
                            placeholder="Entrez le titre de l'information"
                            className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground"
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="type" className="text-sm font-medium text-foreground">
                            Type d&apos;information *
                        </label>
                        <Select
                            value={formData.type}
                            onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value }))}
                        >
                            <SelectTrigger
                                id="type"
                                className="bg-card border-border text-foreground focus:ring-ring focus:border-ring"
                            >
                                <SelectValue placeholder="Sélectionnez le type" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                                {Object.entries(newsTypeLabels).map(([value, label]) => (
                                    <SelectItem
                                        key={value}
                                        value={value}
                                        className="text-foreground focus:bg-muted focus:text-foreground"
                                    >
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="content" className="text-sm font-medium text-foreground">
                            Contenu *
                        </label>
                        <Textarea
                            name="content"
                            id="content"
                            required
                            value={formData.content}
                            onChange={handleChange}
                            placeholder="Entrez le contenu de l'information"
                            className="bg-card border-border text-foreground focus:ring-ring focus:border-ring placeholder:text-muted-foreground min-h-[200px]"
                        />
                    </div>

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
                                {isDeleting ? 'Suppression...' : 'Supprimer'}
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

/** Reads the API's French error message, whichever key it used. */
const apiError = (data: unknown, fallback: string): string => {
    const body = data as { error?: string; message?: string } | null;
    return body?.error || body?.message || fallback;
};

export function AddNewsFormBackend({
    onSuccess,
    onCancel,
}: {
    onSuccess?: (newsId: number) => void;
    onCancel?: () => void;
}) {
    const { toastError, toastSuccess } = useFormToast();

    const handleSubmit = async (formData: NewsFormData): Promise<number> => {
        const res = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const message = apiError(data, 'Échec de la création de l’information');
            toastError(message);
            throw new Error(message);
        }

        toastSuccess('L’information a été ajoutée.');
        return data?.article?.id ?? 0;
    };

    return (
        <NewsFormBackendBase
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
            onCancel={onCancel}
            submitButtonText="Ajouter l’information"
            loadingText="Ajout en cours..."
        />
    );
}

export function EditNewsFormBackend({
    newsId,
    initialData,
    onSuccess,
    onCancel,
}: {
    newsId: number;
    initialData: NewsFormData;
    onSuccess?: (newsId: number, isDeleted?: boolean) => void;
    onCancel?: () => void;
}) {
    const { toastError, toastSuccess } = useFormToast();

    const handleSubmit = async (formData: NewsFormData): Promise<number> => {
        const res = await fetch(`/api/news/${newsId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const message = apiError(data, 'Échec de la mise à jour de l’information');
            toastError(message);
            throw new Error(message);
        }

        toastSuccess('L’information a été mise à jour.');
        return newsId;
    };

    const handleDelete = async () => {
        const res = await fetch(`/api/news/${newsId}`, { method: 'DELETE' });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error(apiError(data, 'Échec de la suppression de l’information'));
        }

        toastSuccess('L’information a été supprimée.');
        onSuccess?.(newsId, true);
    };

    return (
        <NewsFormBackendBase
            key={newsId}
            initialData={initialData}
            onSubmit={handleSubmit}
            onSuccess={onSuccess}
            onCancel={onCancel}
            onDelete={handleDelete}
            showDelete
            submitButtonText="Mettre à jour"
            loadingText="Mise à jour..."
        />
    );
}
