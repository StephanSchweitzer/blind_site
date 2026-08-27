import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    OrderFormBackendBase,
    formatEuro2,
    type OrderFormData,
    type OrderAssignment,
    type User,
    type Book,
} from '@/admin/OrderFormBackendBase';
import { BillIssuedDialog } from '@/admin/BillIssuedDialog';

// Edit Order Form using the base
export function EditOrderFormBackend({
                                         orderId,
                                         initialData,
                                         onSuccess,
                                         initialSelectedUser,
                                         initialSelectedBook,
                                         initialSelectedStaff,
                                         initialBill,
                                     }: {
    orderId: string;
    initialData: OrderFormData;
    onSuccess?: (orderId: number, isDeleted?: boolean) => void;
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
    initialBill?: { id: number; state: string } | null;
}) {
    const { toast } = useToast();

    // Fetch the linked affectation (if any) so the form can show reader/status
    // context and a deep-link. Self-contained here, so callers (EditOrderModal)
    // need no changes.
    const [assignment, setAssignment] = useState<OrderAssignment | null>(null);
    useEffect(() => {
        fetch(`/api/orders/${orderId}/assignment`)
            .then((r) => (r.ok ? r.json() : null))
            .then(setAssignment)
            .catch(() => {});
    }, [orderId]);

    type Notice =
        | { billId: number; billState: string; kind: 'COST'; newTotal?: string | null }
        | { billId: number; billState: string; kind: 'VISIBLE' }
        | { billId: number; billState: string; kind: 'ISSUED'; total: string }
        | { billId: number; billState: string; kind: 'DETACHED'; newTotal?: string | null };
    const [notice, setNotice] = useState<Notice | null>(null);
    const resolveRef = useRef<((id: number) => void) | null>(null);

    // Deux boîtes, une seule à la fois : « facture émise » porte un bouton
    // d'impression, les autres avis n'ont rien à imprimer sur-le-champ.
    const issuedNotice = notice?.kind === 'ISSUED' ? notice : null;
    const otherNotice = notice && notice.kind !== 'ISSUED' ? notice : null;

    const acknowledgeNotice = () => {
        const resolve = resolveRef.current;
        resolveRef.current = null;
        setNotice(null);
        resolve?.(parseInt(orderId));
    };

    const handleDelete = async (): Promise<void> => {
        const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });

        if (!response.ok) {
            // Surface the API's error message in a toast (same protocol as the
            // update path) so blocking rules — e.g. "supprimez d'abord
            // l'attribution" — reach the user instead of failing silently.
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.message || 'Échec de la suppression de la demande';
            toast({
                variant: "destructive",
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{errorMessage}</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
            // Signal failure to the caller (keeps the modal open, resets loading)
            // without a message, so the inline fallback doesn't duplicate the toast.
            throw new Error();
        }

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">La demande a été supprimée avec succès</span>,
            className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
        });
        if (onSuccess) onSuccess(parseInt(orderId), true);
    };

    const handleSubmit = async (formData: OrderFormData): Promise<number> => {
        const response = await fetch(`/api/orders/${orderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMessage = errorData?.message || 'Échec de la mise à jour de la demande';
            toast({
                variant: "destructive",
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Erreur</span>,
                description: <span className="text-xl mt-2">{errorMessage}</span>,
                className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
            });
            return Promise.reject();
        }

        const data = await response.json().catch(() => null);

        toast({
            // @ts-expect-error jsx in toast
            title: <span className="text-2xl font-bold">Succès</span>,
            description: <span className="text-xl mt-2">La demande a été mise à jour avec succès</span>,
            className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
        });

        // Hold the modal open behind the reprint dialogue; resolve on acknowledge.
        if (data?.billNotice) {
            setNotice(data.billNotice as Notice);
            return new Promise<number>((resolve) => { resolveRef.current = resolve; });
        }

        return parseInt(orderId);
    };

    return (
        <>
            <OrderFormBackendBase
                initialData={initialData}
                currentOrderId={parseInt(orderId)}
                onSubmit={handleSubmit}
                onDelete={handleDelete}
                showDelete={true}
                submitButtonText="Mettre à jour la demande"
                loadingText="Mise à jour en cours..."
                title="Modifier la demande"
                onSuccess={onSuccess}
                initialSelectedUser={initialSelectedUser}
                initialSelectedBook={initialSelectedBook}
                initialSelectedStaff={initialSelectedStaff}
                initialBill={initialBill}
                initialAssignment={assignment}
            />

            {/* Une facture qui vient d'être émise ne demande pas un accusé de
                réception mais une impression : elle a sa propre boîte, qui porte
                le bouton. Les autres avis restent des avis. */}
            <BillIssuedDialog
                billId={issuedNotice?.billId ?? null}
                description={
                    <>
                        En passant cette demande à « Terminé », elle a été rattachée à la facture
                        #{issuedNotice?.billId}, qui a atteint le seuil de facturation du client et vient
                        d&apos;être émise (total : {formatEuro2(issuedNotice?.total)} €).
                    </>
                }
                onClose={acknowledgeNotice}
            />

            <Dialog open={!!otherNotice} onOpenChange={(open) => { if (!open) acknowledgeNotice(); }}>
                <DialogContent className="bg-card border-border max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-amber-700 dark:text-amber-300">
                            {otherNotice?.kind === 'COST' && 'Coût modifié — facture à régénérer'}
                            {otherNotice?.kind === 'VISIBLE' && 'Éléments visibles modifiés'}
                            {otherNotice?.kind === 'DETACHED' && 'Demande retirée du brouillon'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="text-foreground text-sm space-y-3">
                        {otherNotice?.kind === 'COST' && (
                            <p>
                                Vous avez modifié le coût de cette demande, ce qui a mis à jour le montant total de la
                                facture #{otherNotice?.billId}{otherNotice?.newTotal ? ` (nouveau total : ${otherNotice.newTotal} €)` : ''}.
                                Veuillez consulter la facture, la réimprimer et relancer le processus de facturation afin de
                                conserver des enregistrements corrects.
                            </p>
                        )}
                        {otherNotice?.kind === 'VISIBLE' && (
                            <p>
                                Vous avez modifié un élément figurant sur la facture #{otherNotice?.billId} (livre, date ou type).
                                Le montant total n&apos;a pas changé, mais le document déjà émis n&apos;est plus à jour :
                                pensez à le réimprimer.
                            </p>
                        )}
                        {otherNotice?.kind === 'DETACHED' && (
                            <p>
                                En sortant cette demande de « Terminé », elle a été retirée de la facture
                                #{otherNotice?.billId} (brouillon)
                                {otherNotice?.newTotal ? `, dont le total est maintenant de ${otherNotice.newTotal} €` : ''} :
                                c&apos;est le passage à « Terminé » qui l&apos;y avait mise. Elle rejoindra un
                                brouillon à nouveau le jour où elle sera terminée pour de bon.
                            </p>
                        )}
                        {otherNotice && (
                            <Link
                                href={`/admin/bills?bill=${otherNotice.billId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-blue-400 hover:text-blue-300 underline underline-offset-2"
                            >
                                Voir la facture #{otherNotice.billId}
                            </Link>
                        )}
                    </div>
                    <div className="flex justify-end mt-4">
                        <Button onClick={acknowledgeNotice} className="bg-amber-600 hover:bg-amber-700 text-white">
                            J&apos;ai compris
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
