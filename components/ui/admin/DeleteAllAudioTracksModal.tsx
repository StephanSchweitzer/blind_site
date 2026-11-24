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
import { useWarnIfUnsavedChanges } from '@/components/userWarnIfUnsavedChanges';

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

    // A large folder takes several requests: leaving the page stops between two
    // of them. Nothing is lost (every slice is recorded), but the folder is left
    // half-moved, so the browser asks first.
    useWarnIfUnsavedChanges({
        unsaved: isDeleting,
        prompt: {
            title: 'Suppression en cours',
            description:
                'Les pistes sont en cours de déplacement vers la corbeille. Si vous quittez la page, ' +
                'celles qui restent resteront dans le dossier : il faudra relancer la suppression.',
            confirmLabel: 'Quitter quand même',
            cancelLabel: 'Rester sur la page',
        },
    });

    const handleDelete = async () => {
        if (!confirmed || isDeleting) return;
        setIsDeleting(true);
        setProgress({ done: 0, total: trackCount });
        // Hors du try : le catch doit savoir si des pistes ont déjà quitté le dossier.
        let moved = 0;
        try {
            // Un gros dossier se vide en plusieurs requêtes : chacune fait ce qui
            // tient dans son délai et répond `remaining` (voir TIME_BUDGET_MS dans
            // la route). On rappelle avec le nombre de pistes que la route vient
            // de laisser — le même contrôle qu'à la première confirmation.
            type Done = {
                message?: string;
                failed?: { name: string; message: string }[];
                deletedCount?: number;
                remaining?: number;
                trackCountAfter?: number;
            };
            let confirmCount = trackCount;
            let data: Done;
            for (;;) {
                // Ce qui a déjà quitté le dossier avant cette requête : la barre
                // reste une seule barre, de 0 au total confirmé.
                const before = trackCount - confirmCount;
                const res = await fetch(`/api/books/${bookId}/audio/tracks`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confirmCount, stream: true }),
                });
                // Les refus (404, 409…) arrivent en JSON ordinaire, avant tout flux.
                const streaming = res.ok && !!res.body;
                if (!streaming) {
                    throw userErrorFromResponse(res, await res.json().catch(() => null));
                }

                // Flux NDJSON : des lignes `progress`, puis `done` ou `error`.
                const final: { data: Done | null } = { data: null };
                await readNdjson<Done & { type: string; done?: number; total?: number }>(res.body!, (msg) => {
                    if (msg.type === 'progress') {
                        setProgress({ done: Math.min(trackCount, before + (msg.done ?? 0)), total: trackCount });
                    } else if (msg.type === 'done') final.data = msg;
                    else if (msg.type === 'error') {
                        throw userErrorFromResponse(new Response(null, { status: 500 }), msg);
                    }
                });
                // Flux coupé sans ligne finale : l'issue est inconnue (délai dépassé).
                if (!final.data) {
                    throw new TypeError('Failed to fetch');
                }
                data = final.data;
                moved += data.deletedCount ?? 0;

                if (!data.remaining) break;
                // Rien n'a quitté le dossier : une requête de plus referait la même chose.
                if (!data.deletedCount) break;
                confirmCount = data.trackCountAfter ?? confirmCount - data.deletedCount;
            }

            const failed = (data.failed ?? []) as { name: string; message: string }[];
            const left = data.trackCountAfter ?? 0;
            const complete = left === 0;
            const s = (n: number) => (n > 1 ? 's' : '');
            toast({
                ...(!complete
                    ? // Une suppression partielle reste à l'écran : elle dit quoi relancer.
                      { variant: 'destructive' as const, duration: Infinity }
                    : {}),
                title: complete ? 'Déplacées dans la corbeille' : 'Suppression partielle',
                description: (
                    <span>
                        {complete
                            ? `${moved} piste${s(moved)} déplacée${s(moved)} dans la corbeille.`
                            : `${moved} piste${s(moved)} déplacée${s(moved)} dans la corbeille, ` +
                              `${left} ${left > 1 ? 'sont restées' : 'est restée'} dans le dossier.`}
                        {!complete && (
                            <span className="block mt-2">
                                {failed.length > 0 &&
                                    `En échec : ${failed.map((f) => `« ${f.name} » (${f.message})`).join(', ')}. `}
                                Relancez la suppression : les fichiers déjà déplacés ne le seront pas
                                deux fois.
                            </span>
                        )}
                    </span>
                ),
                variant: !complete ? 'error' : 'success',
            });

            onDeleted?.();
            onOpenChange(false);
            setTyped('');
        } catch (err) {
            const known = toUserFacingError(err).kind === 'known';
            const base = apiErrorToast(err, {
                title: 'Suppression impossible',
                action: `Supprimer les ${trackCount} pistes du livre #${bookId}`,
            });
            // Un refus qui arrive sur une requête de relance (un dossier modifié
            // entre-temps : 409) n'est pas « rien n'a changé » : les requêtes
            // précédentes ont déjà vidé une partie du dossier. Le toast ne le
            // disait pas, la liste n'était pas relue et la fenêtre restait sur l'ancien
            // compte — chaque nouvel essai retombait sur le même refus.
            const s = (n: number) => (n > 1 ? 's' : '');
            toast(
                moved > 0
                    ? {
                          ...base,
                          duration: Infinity,
                          title: known ? 'Suppression interrompue' : base.title,
                          description: (
                              <span>
                                  <span className="block mb-1">
                                      {`${moved} piste${s(moved)} déjà déplacée${s(moved)} dans la corbeille avant ` +
                                          'l’interruption. Les autres sont encore dans le dossier : relancez la ' +
                                          'suppression depuis la liste à jour.'}
                                  </span>
                                  {base.description}
                              </span>
                          ),
                      }
                    : base,
            );
            // Issue inconnue, ou pistes déjà déplacées : on referme et on relit
            // le dossier, pour que la liste montre l'état réel plutôt que celui
            // d'avant la tentative. Un refus connu à la première requête, lui,
            // n'a rien changé — la fenêtre reste ouverte.
            if (!known || moved > 0) {
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
                // Esc, a click outside and × all land here. Closed mid-run, the
                // requests went on unseen while the bar said « Ne fermez pas ».
                if (!open && isDeleting) return;
                if (!open) setTyped('');
                onOpenChange(open);
            }}
        >
            <DialogContent className="max-w-lg bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Supprimer toutes les pistes
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        {trackCount > 1
                            ? `Les ${trackCount} pistes de ce dossier seront déplacées dans la corbeille du livre.`
                            : 'L’unique piste de ce dossier sera déplacée dans la corbeille du livre.'}
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
                            // Enter confirms, as in the one-track dialogue.
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleDelete();
                                }
                            }}
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
