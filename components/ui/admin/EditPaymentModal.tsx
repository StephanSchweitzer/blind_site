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
import { markToasted } from '@/hooks/useFormToast';
import { getPaymentTypeColor, getPaymentTypeLabel } from '@/lib/payment-enums';
import { derivePaymentStatus, getPaymentStatusColor, getPaymentStatusLabel } from '@/lib/payments/status';
import { PaymentDocumentActions } from './PaymentDocumentActions';
import { CopyableId } from './CopyableId';
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
        requestDate: p.requestDate,
        paymentReference: p.paymentReference,
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
        let active = true;

        Promise.resolve().then(() => {
            if (!active) return;
            if (!isOpen || paymentId === null) {
                setPayment(null);
                setError(null);
            } else {
                loadPayment(paymentId);
            }
        });

        return () => { active = false; };
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
                title: "Enregistrement impossible",
                description: message
            });
            throw markToasted(new Error(message));
        }

        toast({
            title: "Paiement enregistré",
            className: 'bg-green-100 border-green-500 text-green-900',
        });

        return data.payment.id;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-3">
                        Paiement
                        {paymentId && <CopyableId id={paymentId} label="du paiement" />}
                        {payment && (
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getPaymentTypeColor(payment.type)}`}>
                                {getPaymentTypeLabel(payment.type)}
                            </span>
                        )}
                        {payment && (
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${getPaymentStatusColor(derivePaymentStatus(payment))}`}>
                                {getPaymentStatusLabel(derivePaymentStatus(payment))}
                            </span>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {isLoading && (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground py-10">
                        <Loader2 className="h-5 w-5 animate-spin" /> Chargement...
                    </div>
                )}

                {error && !isLoading && (
                    <div className="px-3 py-4 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                        {error}
                    </div>
                )}

                {payment && !isLoading && (
                    <div className="space-y-4">
                        {/* Les documents d'abord : c'est souvent pour eux qu'on ouvre un
                            paiement demandé ou encaissé. Une demande envoyée ou un reçu
                            émis rendent le paiement à jour, et le formulaire se
                            remonte sur ces nouvelles dates (la clé). */}
                        <PaymentDocumentActions
                            payment={payment}
                            onPaymentChanged={(updated) => { setPayment(updated); onPaymentUpdated?.(); }}
                        />

                        <PaymentFormBackendBase
                            key={`${payment.id}-${payment.requestDate ?? ''}-${payment.receiptNumber ?? ''}`}
                            initialData={toInitialData(payment)}
                            locked={!payment.canEditLockedFields}
                            onSubmit={handleSubmit}
                            submitButtonText="Enregistrer les modifications"
                            loadingText="Enregistrement..."
                            onSuccess={() => {
                                onPaymentUpdated?.();
                                onOpenChange(false);
                            }}
                        />

                        {/* pt-2 : avec le space-y-4, 24 px sous la barre d'enregistrement
                            — la bande que couvre son ombre (voir StickySubmitBar). À 16 px,
                            l'ombre mangeait le haut de ce bouton. */}
                        <div className="flex justify-end pt-2">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => { if (paymentId !== null && onRequestDelete) onRequestDelete(paymentId); }}
                                className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
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