'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPaymentTypeColor, getPaymentTypeLabel } from '@/lib/payment-enums';
import type { SerializedPayment } from '@/types/api/payment.api';
import {
    PaymentFormBackendBase,
    paymentFormDataToApiBody,
    type PaymentFormData,
    type PaymentFormInitialData,
} from '@/admin/PaymentFormBackendBase';

interface EditPaymentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    paymentId: number | null;
    onRequestDelete?: (paymentId: number) => void;
    onPaymentUpdated?: () => void;
}

function toInitialData(p: SerializedPayment): PaymentFormInitialData {
    return {
        type: p.type,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        creationDate: p.creationDate,
        issueDate: p.issueDate,
        paymentDate: p.paymentDate,
        receiptNumber: p.receiptNumber,
        fiscalite: p.fiscalite,
        cotisationYear: p.cotisationYear,
        comptable: p.comptable,
        isAllocated: p.isAllocated,
        allocationDate: p.allocationDate,
        observations: p.observations,
        client: p.client,
        bill: p.bill,
    };
}

export function EditPaymentModal({
                                     isOpen,
                                     onOpenChange,
                                     paymentId,
                                     onRequestDelete,
                                     onPaymentUpdated,
                                 }: EditPaymentModalProps) {
    const { toast } = useToast();
    const [payment, setPayment] = useState<SerializedPayment | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadPayment = useCallback(async (id: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/payments/${id}`);
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.message || 'Échec du chargement du paiement');
            setPayment(data.payment);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inattendue');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || paymentId === null) {
            setPayment(null);
            setError(null);
            return;
        }
        loadPayment(paymentId);
    }, [isOpen, paymentId, loadPayment]);

    const handleSubmit = async (formData: PaymentFormData): Promise<number> => {
        if (paymentId === null) throw new Error('Identifiant manquant');

        const res = await fetch(`/api/payments/${paymentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentFormDataToApiBody(formData)),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
            const message = data?.message || 'Échec de la mise à jour du paiement';
            toast({
                variant: 'destructive',
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{message}</span>,
                className: 'bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6',
            });
            throw new Error(message);
        }

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">Le paiement a été mis à jour</span>,
            className: 'bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6',
        });

        return data.payment.id;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-gray-100 flex items-center gap-3">
                        Paiement {paymentId ? `#${paymentId}` : ''}
                        {payment && (
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getPaymentTypeColor(payment.type)}`}>
                                {getPaymentTypeLabel(payment.type)}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-gray-400 py-10">
                        <Loader2 className="h-5 w-5 animate-spin" /> Chargement...
                    </div>
                )}

                {error && !isLoading && (
                    <div className="px-3 py-4 bg-red-900/20 border border-red-800 rounded-md text-red-200 text-sm">
                        {error}
                    </div>
                )}

                {payment && !isLoading && (
                    <div className="space-y-4">
                        <PaymentFormBackendBase
                            key={payment.id}
                            initialData={toInitialData(payment)}
                            onSubmit={handleSubmit}
                            submitButtonText="Enregistrer les modifications"
                            loadingText="Enregistrement..."
                            title="Modifier le paiement"
                            onSuccess={() => {
                                onPaymentUpdated?.();
                                onOpenChange(false);
                            }}
                        />

                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => { if (paymentId !== null && onRequestDelete) onRequestDelete(paymentId); }}
                                className="bg-red-700 hover:bg-red-600 text-gray-100 flex items-center gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Supprimer le paiement
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}