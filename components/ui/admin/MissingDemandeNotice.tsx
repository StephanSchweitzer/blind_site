'use client';

import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FilePlus2, Loader2, TriangleAlert } from 'lucide-react';
import { AddOrderFormBackend } from '@/admin/AddOrderFormBackend';
import type { Book } from '@/admin/OrderFormBackendBase';

/**
 * « Ce livre n'est rattaché à aucune demande » — dit avant le dépôt, pas après.
 *
 * POURQUOI ICI, ET POURQUOI UN AVIS PLUTÔT QU'UN REFUS
 *
 * Un enregistrement déposé sur un livre qu'aucune demande ni attribution ne
 * nomme est un « enregistrement fantôme » : la demande étant le seul support du
 * tarif (lib/pricing-sync.ts), l'auditeur reçoit l'audio et n'est jamais
 * facturé, et aucun lecteur n'est crédité de la lecture. Le portail ne peut pas
 * rattraper ça plus tard — l'envoi à l'auditeur se fait hors de l'application,
 * il n'existe aucune ligne qui manquerait à l'appel. Le dépôt est donc le
 * dernier moment observable, d'où cet avis à cet endroit.
 *
 * Refuser le dépôt serait faux : les ~11 500 livres importés d'Access n'ont
 * aucune demande, une duplication ne porte aucune attribution
 * (.claude/rules/status-sync.md), et la même fenêtre s'ouvre depuis la fusion de
 * doublons et le rattachement d'un dossier orphelin. On avertit, et on rend la
 * correction faisable sur place.
 *
 * LA DÉCISION EST ICI, PAS DANS LE JSX DE L'APPELANT
 *
 * Le composant reçoit les compteurs bruts et décide lui-même de se taire —
 * comme RecordingAdviceNotice, et pour la même raison
 * (.claude/rules/order-recording-warnings.md) : une condition écrite dans le JSX
 * du formulaire appelant a déjà existé, et a disparu au premier nettoyage.
 * L'appelant monte le composant sans condition ; `null` ou des compteurs non
 * nuls ne rendent rien.
 */
export function MissingDemandeNotice({
    bookId,
    bookTitle,
    orderCount,
    assignmentCount,
    onCreated,
    disabled = false,
}: {
    bookId: number;
    bookTitle?: string | null;
    /** `null`/`undefined` = pas encore chargé : on ne dit rien plutôt que de crier à tort. */
    orderCount: number | null | undefined;
    assignmentCount: number | null | undefined;
    /** Une demande vient d'être créée — l'appelant recharge, l'avis disparaît. */
    onCreated?: () => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    /** Le livre réel, chargé à l'ouverture — voir openForm. */
    const [book, setBook] = useState<Book | null>(null);
    const [loadingBook, setLoadingBook] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Le formulaire seed le tarif conseillé sur `audioSizeKb` et l'avis
     * « enregistrement » sur `audio_filepath` : lui fabriquer un livre à partir
     * du seul titre affiché ici lui ferait proposer le tarif plancher pour un
     * ouvrage qui pèse peut-être 700 Mio. On va donc chercher la vraie fiche,
     * comme CreateBookDialog le fait après création.
     */
    const openForm = useCallback(async () => {
        setLoadingBook(true);
        try {
            const res = await fetch(`/api/books/${bookId}`);
            if (!res.ok) throw new Error();
            setBook((await res.json()) as Book);
            setOpen(true);
        } catch {
            // Pas de demi-formulaire : sans la fiche, le tarif serait faux.
            setError("Impossible de charger la fiche du livre. Réessayez dans un instant.");
        } finally {
            setLoadingBook(false);
        }
    }, [bookId]);

    const known = typeof orderCount === 'number' && typeof assignmentCount === 'number';
    const unattached = known && orderCount === 0 && assignmentCount === 0;

    if (!unattached) return null;

    return (
        <>
            <div
                className="flex-shrink-0 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                role="status"
            >
                <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        Aucune demande ni attribution n’est associée à ce livre.
                    </p>
                    <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
                        Rien ne rattache cet enregistrement à un auditeur : une fois gravé et
                        envoyé, il ne pourra plus être facturé, et aucun lecteur n’en sera
                        crédité. Créez la demande maintenant si l’ouvrage a bien été demandé.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled || loadingBook}
                        onClick={() => void openForm()}
                        className="mt-2 bg-field border-amber-500/40 text-foreground hover:bg-muted"
                    >
                        <span className="flex items-center gap-2">
                            {loadingBook ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FilePlus2 className="h-4 w-4" />
                            )}
                            Créer la demande
                        </span>
                    </Button>
                    {error && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
                    )}
                </div>
            </div>

            {/* Empilé au-dessus de la fenêtre audio plutôt que d'y naviguer : un
                envoi peut être en préparation derrière, et Radix ferme la seule
                fenêtre du dessus sur Échap. Même montage que CreateBookDialog
                dans AddOrderFormBackend, à un étage près. */}
            <Dialog open={open && book !== null} onOpenChange={setOpen}>
                <DialogContent className="max-w-4xl max-h-[88dvh] overflow-y-auto bg-card border-border">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            Nouvelle demande{bookTitle ? ` — ${bookTitle}` : ''}
                        </DialogTitle>
                    </DialogHeader>
                    {/* Le livre est pré-rempli, l'auditeur non : la fenêtre audio
                        ignore pour qui l'enregistrement a été fait, et décider qui
                        est facturé n'est pas une chose à deviner. Le type de ligne
                        reste sur son défaut pour la même raison — enregistrement ou
                        duplication est un fait, pas une hypothèse. */}
                    {book && (
                        <AddOrderFormBackend
                            initialBook={book}
                            onSuccess={() => {
                                setOpen(false);
                                onCreated?.();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
