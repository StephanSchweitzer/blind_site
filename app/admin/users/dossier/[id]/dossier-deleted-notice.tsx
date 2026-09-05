'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
 * The « cette fiche est supprimée » banner, and the only control left live on a
 * deleted dossier.
 *
 * WHY A DELETED DOSSIER OPENS AT ALL
 *
 * `deletedAt` hides a person from every list read, but `findUnique` is
 * deliberately left unfiltered (lib/prisma.ts) so admin access by id — the
 * journal's link, a bookmark, an old URL in a mail — still resolves. That is the
 * right behaviour; what was missing is that the page then rendered exactly like
 * a live one. A permanent could read a deleted person's fiche, and edit it,
 * without a single sign that the row no longer exists as far as the rest of the
 * portal is concerned.
 *
 * So the page stays reachable and readable, and everything below this banner is
 * greyed and inert. Restoring is the one action that makes sense on a record
 * that is not supposed to be there.
 */

interface DossierDeletedNoticeProps {
    userId: number;
    fullName: string;
    /** ISO string — formatted here so the server and client agree on the zone. */
    deletedAt: string;
}

export default function DossierDeletedNotice({
    userId,
    fullName,
    deletedAt,
}: DossierDeletedNoticeProps) {
    const router = useRouter();
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
            const response = await fetch(`/api/user/${userId}/restore`, { method: 'POST' });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.message ?? 'Échec de la restauration');
            }
            toast({
                title: 'Fiche restaurée',
                description: body?.message ?? `${fullName} a été restauré.`,
            });
            setConfirmOpen(false);
            router.refresh();
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
                                déroulants. Ses factures, demandes et attributions passées gardent
                                leur référence. Le reste de la page est en lecture seule tant
                                qu’elle n’est pas restaurée.
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
                        <AlertDialogTitle>Restaurer {fullName} ?</AlertDialogTitle>
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
