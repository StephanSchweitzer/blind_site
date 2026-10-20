'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DeletePaymentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    paymentId: number | null;
    onPaymentDeleted?: () => void;
}

export function DeletePaymentModal({
                                       isOpen,
                                       onOpenChange,
                                       paymentId,
                                       onPaymentDeleted,
                                   }: DeletePaymentModalProps) {
    const { toast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);
    const [reason, setReason] = useState('');

    const [wasOpen, setWasOpen] = useState(isOpen);
    if (wasOpen && !isOpen) {
        setReason('');
    }
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
    }

    const handleDelete = async () => {
        if (paymentId === null) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/payments/${paymentId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason.trim() || undefined }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec de la suppression');

            toast({
                title: "Paiement supprimé",
                className: 'bg-green-100 border-green-500 text-green-900',
            });
            onPaymentDeleted?.();
        } catch (err) {
            toast({
                variant: 'destructive',
                title: "Suppression impossible",
                description: err instanceof Error ? err.message : 'Erreur inattendue'
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                        Supprimer le paiement {paymentId ? `#${paymentId}` : ''}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        Cette action désactive le paiement (suppression réversible). Vous pouvez indiquer un motif.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Motif (facultatif)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="Ex: doublon, erreur de saisie…"
                        className="w-full rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/50"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-2">
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
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                    >
                        {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Supprimer
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}