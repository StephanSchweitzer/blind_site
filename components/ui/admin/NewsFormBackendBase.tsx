'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';
import { markToasted, useFormToast } from '@/hooks/useFormToast';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
    const { toastFailure } = useFormToast();
    const confirm = useConfirm();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);

        try {
            const newsId = await onSubmit(formData);
            onSuccess?.(newsId);
        } catch (err) {
            toastFailure(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteClick = async () => {
        if (!onDelete) return;
        if (!(await confirm({
            title: 'Supprimer cette information ?',
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
            </div>
    );
}

/** Reads the API's French error message, whichever key it used. */
const apiError = (data: unknown, fallback: string): string => {
    const body = data as { error?: string; message?: string } | null;
    // `message` d'abord : c'est la phrase française pour le permanent, `error`
    // n'étant souvent qu'un code anglais (« Genre in use »).
    return body?.message || body?.error || fallback;
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
            toastError(message, 'Création impossible');
            throw markToasted(new Error(message));
        }

        toastSuccess('Information ajoutée');
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
            throw markToasted(new Error(message));
        }

        toastSuccess('Information enregistrée');
        return newsId;
    };

    const handleDelete = async () => {
        const res = await fetch(`/api/news/${newsId}`, { method: 'DELETE' });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            throw new Error(apiError(data, 'Échec de la suppression de l’information'));
        }

        toastSuccess('Information supprimée');
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
