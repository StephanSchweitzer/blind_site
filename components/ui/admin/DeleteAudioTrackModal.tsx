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

export interface AudioTrackTarget {
    order: number;
    key: string;
    name: string;
    sizeBytes: number;
}

interface DeleteAudioTrackModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: number;
    track: AudioTrackTarget | null;
    onDeleted?: () => void;
}

const formatSize = (bytes: number) =>
    bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1e3))} Ko`;

/**
 * Confirmation before moving one track to the corbeille.
 *
 * The gate is the track's displayed position, not its full filename. Real names
 * look like `1000  22- Le secret de l!abbé Saunière.mp3` — double spaces, an
 * exclamation mark standing in for an apostrophe — so demanding an exact retype
 * just trains people to paste without reading, which is the habit the
 * confirmation exists to prevent. Typing the number instead forces them to look
 * at the row they actually mean, and the full name is displayed verbatim above it.
 */
export function DeleteAudioTrackModal({
    isOpen,
    onOpenChange,
    bookId,
    track,
    onDeleted,
}: DeleteAudioTrackModalProps) {
    const { toast } = useToast();
    const [typed, setTyped] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Reset when a different track is targeted, without a state-setting effect.
    const [lastKey, setLastKey] = useState<string | null>(null);
    if (track && track.key !== lastKey) {
        setLastKey(track.key);
        setTyped('');
    }

    const confirmed = track ? typed.trim() === String(track.order) : false;

    const handleDelete = async () => {
        if (!track || !confirmed) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/books/${bookId}/audio/track`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: track.key, filename: track.name }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec de la suppression');

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Déplacé dans la corbeille</span>,
                description: (
                    <span className="text-xl mt-2">
                        « {track.name} » est récupérable depuis l’onglet Corbeille.
                    </span>
                ),
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });

            onDeleted?.();
            onOpenChange(false);
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
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Supprimer une piste
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        Cette piste sera déplacée dans la corbeille du livre. Elle n’est pas effacée
                        du stockage immédiatement : une purge automatique la supprime définitivement
                        14 jours après la suppression, sauf restauration entre-temps.
                    </DialogDescription>
                </DialogHeader>

                {track && (
                    <div className="space-y-4">
                        <div className="rounded-md border border-border bg-field p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">
                                Piste n° {track.order} · {formatSize(track.sizeBytes)}
                            </div>
                            {/* Verbatim: double spaces and substituted characters included, so
                                the admin sees exactly which file is meant. */}
                            <div className="mt-1 font-mono text-sm text-foreground break-all whitespace-pre-wrap">
                                {track.name}
                            </div>
                        </div>

                        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                            <Undo2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>
                                Réversible pendant 14 jours : le fichier est copié dans la corbeille
                                avant d’être retiré du dossier, et la copie est vérifiée.
                            </span>
                        </div>

                        <div>
                            <label htmlFor="confirm-order" className="text-sm text-foreground">
                                Pour confirmer, tapez le numéro de la piste :{' '}
                                <span className="font-semibold">{track.order}</span>
                            </label>
                            <Input
                                id="confirm-order"
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder={String(track.order)}
                                className="mt-1 bg-field border-border text-foreground"
                            />
                        </div>
                    </div>
                )}

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
                            'Déplacer dans la corbeille'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
