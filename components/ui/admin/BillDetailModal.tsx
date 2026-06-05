'use client';

import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import {
    BillingStatus,
    getBillingStatusColor,
    getBillingStatusLabel,
} from '@/lib/billing-enums';

interface BillOrder {
    id: number;
    requestReceivedDate: string;
    cost: number | string | null;
    billingStatus: string;
    catalogue: { title: string; author: string };
}

interface BillDetail {
    id: number;
    state: BillingStatus;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    invoiceAmount: number | string;
    client: { id: number; name: string | null; email: string | null };
    orders: BillOrder[];
}

interface BillDetailModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    billId: number | null;
    onRequestDelete?: (billId: number) => void;
}

function formatDate(dateString: string | null) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
}

function formatCurrency(amount: number | string) {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
        typeof amount === 'string' ? parseFloat(amount) : amount
    );
}

export function BillDetailModal({ isOpen, onOpenChange, billId, onRequestDelete }: BillDetailModalProps) {
    const [bill, setBill] = useState<BillDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || billId === null) {
            setBill(null);
            setError(null);
            return;
        }

        let cancelled = false;
        const load = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/bills/${billId}`);
                const data = await res.json().catch(() => null);
                if (!res.ok) {
                    throw new Error(data?.message || 'Échec du chargement de la facture');
                }
                if (!cancelled) setBill(data.bill);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inattendue');
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isOpen, billId]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">
                        Facture {billId ? `#${billId}` : ''}
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

                {bill && !isLoading && (
                    <div className="space-y-5">
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Client</div>
                                <div className="text-gray-200 font-medium">{bill.client.name || 'N/A'}</div>
                                <div className="text-gray-400 text-sm">{bill.client.email}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-500 uppercase tracking-wide">État</div>
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getBillingStatusColor(bill.state)}`}>
                                    {getBillingStatusLabel(bill.state)}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Création</div>
                                <div className="text-gray-200">{formatDate(bill.creationDate)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Émission</div>
                                <div className="text-gray-200">{formatDate(bill.issueDate)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wide">Paiement</div>
                                <div className="text-gray-200">{formatDate(bill.paymentDate)}</div>
                            </div>
                        </div>

                        {/* Orders */}
                        <div className="space-y-2">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                                Demandes facturées ({bill.orders.length})
                            </div>
                            <div className="border border-gray-700 rounded-md divide-y divide-gray-700 max-h-[260px] overflow-y-auto">
                                {bill.orders.length === 0 ? (
                                    <div className="px-3 py-4 text-gray-500 text-sm italic">Aucune demande rattachée</div>
                                ) : (
                                    bill.orders.map((o) => (
                                        <div key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-gray-200 text-sm font-medium truncate">
                                                    #{o.id} — {o.catalogue.title}
                                                </div>
                                                <div className="text-gray-400 text-xs truncate">
                                                    {o.catalogue.author} · {formatDate(o.requestReceivedDate)}
                                                </div>
                                            </div>
                                            <span className="text-gray-200 text-sm font-medium whitespace-nowrap">
                                                {o.cost != null ? formatCurrency(o.cost) : '-'}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Total */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                            <span className="text-sm font-medium text-gray-400 uppercase tracking-wide">Montant total</span>
                            <span className="text-xl font-bold text-gray-100">{formatCurrency(bill.invoiceAmount)}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end pt-2">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => { if (billId !== null && onRequestDelete) onRequestDelete(billId); }}
                                className="bg-red-700 hover:bg-red-600 text-gray-100 flex items-center gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Supprimer la facture
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}