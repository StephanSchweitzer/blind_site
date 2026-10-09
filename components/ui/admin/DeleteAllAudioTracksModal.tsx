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
import { apiErrorToast } from '@/admin/ApiErrorMessage';
import { toUserFacingError, userErrorFromResponse } from '@/lib/user-error';
import { readNdjson } from '@/lib/ndjson';
import { AudioDeleteProgress } from './AudioDeleteProgress';

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
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    const confirmed = typed.trim() === String(trackCount);

    const handleDelete = async () => {
        if (!confirmed) return;
        setIsDeleting(true);
        setProgress({ done: 0, total: trackCount });
        try {
            const res = await fetch(`/api/books/${bookId}/audio/tracks`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmCount: trackCount, stream: true }),
            });
            // Les refus (404, 409…) arrivent en JSON ordinaire, avant tout flux.
            const streaming = res.ok && !!res.body;
            if (!streaming) {
                throw userErrorFromResponse(res, await res.json().catch(() => null));
            }

            // Flux NDJSON : des lignes `progress`, puis `done` ou `error`.
            type Done = { message?: string; failed?: { name: string; message: string }[] };
            const final: { data: Done | null } = { data: null };
            await readNdjson<Done & { type: string; done?: number; total?: number }>(res.body!, (msg) => {
                if (msg.type === 'progress') setProgress({ done: msg.done ?? 0, total: msg.total ?? trackCount });
                else if (msg.type === 'done') final.data = msg;
                else if (msg.type === 'error') {
                    throw userErrorFromResponse(new Response(null, { status: 500 }), msg);
                }
            });
            // Flux coupé sans ligne finale : l'issue est inconnue (délai dépassé).
            if (!final.data) {
                throw new TypeError('Failed to fetch');
            }
            const data = final.data;

            const failed = (data.failed ?? []) as { name: string; message: string }[];
            toast({
                ...(failed.length > 0
                    ? // Une suppression partielle reste à l'écran : elle dit quoi relancer.
                      { variant: 'destructive' as const, duration: Infinity }
                    : {}),
                // @ts-expect-error jsx in toast
                title: (
                    <span className="text-2xl font-bold">
                        {failed.length > 0 ? 'Suppression partielle' : 'Déplacées dans la corbeille'}
                    </span>
                ),
                description: (
                    <span className="text-xl mt-2">
                        {data.message ?? 'Les pistes ont été déplacées dans la corbeille.'}
                        {failed.length > 0 && (
                            <span className="block mt-2 text-base">
                                En échec : {failed.map((f) => `« ${f.name} » (${f.message})`).join(', ')}.
                                Relancez la suppression : les fichiers déjà déplacés ne le seront pas
                                deux fois.
                            </span>
                        )}
                    </span>
                ),
                className:
                    failed.length > 0
                        ? 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6'
                        : 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });

            onDeleted?.();
            onOpenChange(false);
            setTyped('');
        } catch (err) {
            toast(
                apiErrorToast(err, {
                    title: 'Suppression impossible',
                    action: `Supprimer les ${trackCount} pistes du livre #${bookId}`,
                }),
            );
            // Issue inconnue : le fichier a pu bouger malgré l'erreur. On referme et
            // on relit le dossier, pour que la liste montre l'état réel plutôt
            // que celui d'avant la tentative. Un refus connu, lui, n'a rien
            // changé — la fenêtre reste ouverte.
            if (toUserFacingError(err).kind !== 'known') {
                onDeleted?.();
                onOpenChange(false);
                setTyped('');
            }
        } finally {
            setIsDeleting(false);
            setProgress(null);
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
                            ? `Les ${trackCount} pistes de ce dossier seront déplacées dans la corbeille du livre, une par une. Une purge automatique les supprimera définitivement 14 jours après leur suppression, sauf restauration individuelle entre-temps.`
                            : 'L’unique piste de ce dossier sera déplacée dans la corbeille du livre. Une purge automatique la supprimera définitivement 14 jours après sa suppression, sauf restauration entre-temps.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        <Undo2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>
                            Réversible pendant 14 jours : chaque fichier est copié dans la corbeille
                            avant d’être retiré du dossier, et la copie est vérifiée avant suppression.
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

                {isDeleting && progress && <AudioDeleteProgress done={progress.done} total={progress.total} />}

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
