'use client';

import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Loader2, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeleteAllAudioTracksModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    trackCount: number;
    onDeleted?: () => void;
}

/**
 * Confirmation before moving every track of a book to the corbeille.
 *
 * Mirrors DeleteAudioTrackModal's gate — typing a number rather than a name —
 * but here it's the track count, since there is no single filename to point
 * at. The count is also re-checked server-side against a fresh listing, so
 * this dialogue only has to stop an accidental click, not guarantee safety.
 */
export function DeleteAllAudioTracksModal({
    isOpen,
    onOpenChange,
    bookId,
    trackCount,
    onDeleted,
}: DeleteAllAudioTracksModalProps) {
    const { toast } = useToast();
    const [typed, setTyped] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const confirmed = typed.trim() === String(trackCount);

    const handleDelete = async () => {
        if (!confirmed) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/tracks`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmCount: trackCount }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec de la suppression');

            const failed = (data?.failed ?? []) as { name: string; message: string }[];
            toast({
                ...(failed.length > 0 ? { variant: 'destructive' as const } : {}),
                // @ts-expect-error jsx in toast
                title: (
                    <span className="text-2xl font-bold">
                        {failed.length > 0 ? 'Suppression partielle' : 'Déplacées dans la corbeille'}
                    </span>
                ),
                description: <span className="text-xl mt-2">{data.message}</span>,
                className:
                    failed.length > 0
                        ? 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6'
                        : 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });

            onDeleted?.();
            onOpenChange(false);
            setTyped('');
        } catch (err) {
            toast({
                variant: 'destructive',
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: (
                    <span className="text-xl mt-2">
                        {err instanceof Error ? err.message : 'Erreur inattendue'}
                    </span>
                ),
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) setTyped('');
                onOpenChange(open);
            }}
        >
            <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Supprimer toutes les pistes
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        {trackCount > 1
                            ? `Les ${trackCount} pistes de ce dossier seront déplacées dans la corbeille du livre, une par une. Elles ne sont pas effacées du stockage et peuvent être restaurées individuellement à tout moment.`
                            : 'L’unique piste de ce dossier sera déplacée dans la corbeille du livre. Elle n’est pas effacée du stockage et peut être restaurée à tout moment.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        <Undo2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            Réversible : chaque fichier est copié dans la corbeille avant d’être
                            retiré du dossier, et la copie est vérifiée avant suppression.
                        </span>
                    </div>

                    <div>
                        <label htmlFor="confirm-count" className="text-sm text-foreground">
                            Pour confirmer, tapez le nombre de pistes à supprimer :{' '}
                            <span className="font-semibold">{trackCount}</span>
                        </label>
                        <Input
                            id="confirm-count"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder={String(trackCount)}
                            className="mt-1 bg-field border-border text-foreground"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={isDeleting}
                        className="bg-field border-border text-foreground hover:bg-muted"
                    >
                        Annuler
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isDeleting || !confirmed}
                        className="bg-red-600 hover:bg-red-700 text-white"
                    >
                        {isDeleting ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Suppression...
                            </span>
                        ) : (
                            'Déplacer tout dans la corbeille'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
