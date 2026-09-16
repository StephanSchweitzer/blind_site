'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
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
 * La « cette fiche est supprimée » de la fiche livre — même rôle et même forme
 * que DossierDeletedNotice côté personnes : la page reste ouvrable par id (la
 * fiche existe toujours, seul `deletedAt` la cache — voir lib/prisma.ts), mais
 * rien ne le montrait avant ce bandeau, et Restaurer est la seule action qui
 * ait un sens sur une fiche censée ne plus exister ailleurs.
 */

interface BookDeletedNoticeProps {
    bookId: number;
    title: string;
    /** ISO string — formaté ici pour que serveur et client s'accordent sur le fuseau. */
    deletedAt: string;
    onRestored: () => void;
}

export default function BookDeletedNotice({
    bookId,
    title,
    deletedAt,
    onRestored,
}: BookDeletedNoticeProps) {
    const { toast } = useToast();
    const [isRestoring, setIsRestoring] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const on = new Date(deletedAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    });

    const handleRestore = async () => {
        setIsRestoring(true);
        try {
            const response = await fetch(`/api/books/${bookId}/restore`, { method: 'POST' });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.message ?? 'Échec de la restauration');
            }
            toast({
                title: 'Fiche restaurée',
                description: body?.message ?? `« ${title} » a été restauré.`,
            });
            setConfirmOpen(false);
            onRestored();
        } catch (error) {
            toast({
                title: 'Erreur',
                description:
                    error instanceof Error ? error.message : 'Échec de la restauration.',
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
                className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <Trash2 size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                        <div>
                            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                                Fiche supprimée le {on}
                            </p>
                            <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                                Elle n’apparaît plus dans les listes, les recherches ni les menus
                                déroulants. Ses demandes et attributions passées gardent leur
                                référence, et son dossier audio reste attaché. Le reste de la
                                page est en lecture seule tant qu’elle n’est pas restaurée.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="shrink-0 bg-background"
                        onClick={() => setConfirmOpen(true)}
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

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurer « {title} » ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            La fiche redeviendra visible partout aux ECA : listes, recherches et
                            menus déroulants. Rien d’autre n’est modifié.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRestoring}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                // Keep the dialog up while the request runs, so the
                                // action cannot be fired twice on a slow network.
                                e.preventDefault();
                                void handleRestore();
                            }}
                            disabled={isRestoring}
                        >
                            {isRestoring && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                            Restaurer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
