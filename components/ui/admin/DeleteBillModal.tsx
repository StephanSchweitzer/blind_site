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
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeleteBillModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    billId: number | null;
    onBillDeleted?: (billId: number) => void;
}

export function DeleteBillModal({ isOpen, onOpenChange, billId, onBillDeleted }: DeleteBillModalProps) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!billId) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/bills/${billId}`, { method: 'DELETE' });
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(data?.message || 'Échec de la suppression de la facture');
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">La facture a été supprimée avec succès</span>,
                className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
            });

            if (onBillDeleted) onBillDeleted(billId);
            onOpenChange(false);
        } catch (err) {
            toast({
                variant: 'destructive',
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{err instanceof Error ? err.message : 'Erreur inattendue'}</span>,
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        Supprimer la facture {billId ? `#${billId}` : ''}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground pt-2">
                        Cette facture sera archivée et les demandes qui y sont rattachées seront détachées
                        (leur état de facturation repassera à « Non facturé »). Cette action peut être effectuée
                        de nouveau si nécessaire.
                    </DialogDescription>
                </DialogHeader>

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
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 text-white"
                    >
                        {isDeleting ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Suppression...
                            </span>
                        ) : (
                            'Supprimer'
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}