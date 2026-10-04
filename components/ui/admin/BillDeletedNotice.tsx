'use client';

import { useState } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { parisDate } from '@/lib/paris-day';

/**
 * La « cette facture est supprimée » de la modale — même rôle et même forme
 * qu'OrderDeletedNotice (demandes), BookDeletedNotice (livres) et
 * DossierDeletedNotice (personnes) : GET /api/bills/[id] ne 404 pas sur
 * `isActive`, donc un lien du journal ou une URL `?bill=` continue de mener
 * quelque part, et la modale doit dire ce que l'on regarde.
 *
 * La confirmation prévient que la facture revient VIDE — voir
 * app/api/bills/[id]/restore/route.ts pour le pourquoi.
 */

interface BillDeletedNoticeProps {
    billId: number;
    /** ISO string — formaté en heure de Paris. */
    deletedAt: string | null;
    onRestored: () => void;
}

export function BillDeletedNotice({ billId, deletedAt, onRestored }: BillDeletedNoticeProps) {
    const { toast } = useToast();
    const confirm = useConfirm();
    const [isRestoring, setIsRestoring] = useState(false);

    const handleRestore = async () => {
        if (!(await confirm({
            title: 'Restaurer cette facture ?',
            description:
                "Elle redeviendra visible dans la liste des factures, en brouillon et vide : les demandes et les paiements " +
                "qui en ont été détachés à la suppression ne sont pas rattachés de nouveau. " +
                "« Ajouter une demande » la remplira.",
            confirmLabel: 'Restaurer',
        }))) return;
        setIsRestoring(true);
        try {
            const response = await fetch(`/api/bills/${billId}/restore`, { method: 'POST' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.message ?? 'Échec de la restauration');
            toast({ title: 'Facture restaurée', description: body?.message });
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
        <div
            role="status"
            className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <Trash2 size={18} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" />
                    <div>
                        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                            Facture supprimée{deletedAt ? ` le ${parisDate(deletedAt)}` : ''}
                        </p>
                        <p className="mt-1 text-sm text-red-700/90 dark:text-red-300/90">
                            Elle n’apparaît plus dans la liste des factures. Ses demandes et ses paiements en ont
                            été détachés. Le reste de la fenêtre est en lecture seule.
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    className="shrink-0 bg-background"
                    onClick={() => void handleRestore()}
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
    );
}
