'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * La « cette demande est supprimée » de la modale d'édition — même rôle et
 * même forme que DossierDeletedNotice (personnes) et BookDeletedNotice
 * (livres) : GET /api/orders/[id] ne 404 plus sur `deletedAt` (lib/prisma.ts
 * ne filtre pas `findUnique`), donc un lien du journal, un signet ou une URL
 * `?order=` tapée à la main continue de mener quelque part plutôt que de
 * jeter un toast d'erreur.
 *
 * Restaurer ouvre GET /api/orders/[id]/restore avant de confirmer — pas pour
 * bloquer comme l'ISBN d'un livre (rien ici n'est une contrainte d'unicité),
 * mais pour prévenir : si la facture liée a évolué pendant la suppression
 * (brouillon devenu émise/payée/soldée), la restauration détache la demande
 * plutôt que de rouvrir une facture verrouillée — voir
 * app/api/orders/[id]/restore/route.ts pour le détail. Le bouton reste actif
 * dans ce cas ; il ne se bloque que si la prévisualisation elle-même échoue.
 */

interface OrderDeletedNoticeProps {
    orderId: number;
    /** ISO string — formaté ici pour que serveur et client s'accordent sur le fuseau. */
    deletedAt: string;
    onRestored: () => void;
}

interface RestorePreview {
    billId: number | null;
    billState: string | null;
    willDetach: boolean;
    restoreWarning: string | null;
}

export default function OrderDeletedNotice({ orderId, deletedAt, onRestored }: OrderDeletedNoticeProps) {
    const { toast } = useToast();
    const [isRestoring, setIsRestoring] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [preview, setPreview] = useState<RestorePreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const on = new Date(deletedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    });

    const openConfirm = async () => {
        setConfirmOpen(true);
        setPreview(null);
        setPreviewError(null);
        try {
            const response = await fetch(`/api/orders/${orderId}/restore`, { cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.message ?? 'Échec de la préparation de la restauration');
            setPreview(body as RestorePreview);
        } catch (error) {
            setPreviewError(
                error instanceof Error ? error.message : 'Échec de la préparation de la restauration.'
            );
        }
    };

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const response = await fetch(`/api/orders/${orderId}/restore`, { method: 'POST' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.message ?? 'Échec de la restauration');
            toast({
                title: 'Demande restaurée',
                description: body?.message ?? 'La demande a été restaurée.',
            });
            setConfirmOpen(false);
            onRestored();
        } catch (error) {
            toast({
                title: 'Erreur',
                description: error instanceof Error ? error.message : 'Échec de la restauration.',
                variant: 'destructive',
            });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <>
            <div
                role="status"
                className="mb-4 rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Trash2 size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                        <div>
                            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                                Demande supprimée le {on}
                            </p>
                            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                                Elle n’apparaît plus dans les listes, les recherches ni les statistiques,
                                et ne compte plus dans aucune facture. Le reste du formulaire est en
                                lecture seule.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 bg-background"
                        onClick={() => void openConfirm()}
                        disabled={isRestoring}
                    >
                        {isRestoring ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                            <RotateCcw size={14} className="mr-1.5" />
                        )}
                        Restaurer
                    </Button>
                </div>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={(open) => !isRestoring && setConfirmOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurer cette demande ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Elle redeviendra visible partout aux ECA : listes, recherches et statistiques.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    {!preview && !previewError && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 size={14} className="animate-spin" />
                            Vérification de la facture liée…
                        </div>
                    )}

                    {previewError && (
                        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                            {previewError}
                        </p>
                    )}

                    {preview?.willDetach && preview.restoreWarning && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <div className="space-y-1">
                                <p>{preview.restoreWarning}</p>
                                {preview.billId != null && (
                                    <Link
                                        href={`/admin/bills?bill=${preview.billId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block font-medium underline underline-offset-2"
                                    >
                                        Voir la facture #{preview.billId}
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}

                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRestoring}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                // Keep the dialog up while the request runs, so the
                                // action cannot be fired twice on a slow network.
                                e.preventDefault();
                                void handleRestore();
                            }}
                            disabled={isRestoring || !preview}
                        >
                            {isRestoring && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                            {preview?.willDetach ? 'Restaurer sans la facture' : 'Restaurer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
