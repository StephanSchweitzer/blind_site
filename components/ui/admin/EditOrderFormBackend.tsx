import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    OrderFormBackendBase,
    formatEuro2,
    type OrderFormData,
    type OrderAssignment,
    type User,
    type Book,
} from '@/admin/OrderFormBackendBase';
import { BillPrintNoticeDialog, type BillPrintNotice } from '@/admin/BillPrintNoticeDialog';

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

    // Deux boîtes, une seule à la fois. Trois des quatre avis se terminent par
    // « imprimez ce document » — le seuil vient d'émettre la facture, ou une
    // facture déjà partie n'est plus à jour — et passent donc par la boîte qui
    // porte le bouton d'impression. « Retirée du brouillon » n'a rien à
    // imprimer : le brouillon n'est jamais sorti.
    const printNotice: BillPrintNotice | null = React.useMemo(() => {
        if (!notice) return null;
        switch (notice.kind) {
            case 'ISSUED':
                return {
                    billId: notice.billId,
                    title: `Facture #${notice.billId} émise`,
                    description: (
                        <>
                            En passant cette demande à « Terminé », elle a été rattachée à la facture
                            #{notice.billId}, qui a atteint le seuil de facturation du client et vient
                            d&apos;être émise (total : {formatEuro2(notice.total)} €).
                        </>
                    ),
                    footnote: (
                        <>
                            Elle est à imprimer et à envoyer au client. Rien n&apos;est perdu si vous fermez :
                            elle vous attend dans les factures, au statut « Émise ».
                        </>
                    ),
                };
            case 'COST':
                return {
                    billId: notice.billId,
                    title: 'Coût modifié — facture à réimprimer',
                    description: (
                        <>
                            Vous avez modifié le coût de cette demande, ce qui a mis à jour le montant total
                            de la facture #{notice.billId}
                            {notice.newTotal ? ` (nouveau total : ${formatEuro2(notice.newTotal)} €)` : ''}.
                            Le document déjà émis n&apos;est plus à jour.
                        </>
                    ),
                    footnote: (
                        <>
                            Réimprimez-la et relancez le processus de facturation, afin que votre exemplaire
                            et celui du client concordent. Rien n&apos;est perdu si vous fermez : elle reste
                            imprimable depuis les factures.
                        </>
                    ),
                    printLabel: 'Réimprimer la facture',
                };
            case 'VISIBLE':
                return {
                    billId: notice.billId,
                    title: 'Éléments visibles modifiés',
                    description: (
                        <>
                            Vous avez modifié un élément figurant sur la facture #{notice.billId} (livre, date
                            ou type). Le montant total n&apos;a pas changé, mais le document déjà émis
                            n&apos;est plus à jour.
                        </>
                    ),
                    footnote: (
                        <>
                            Réimprimez-la pour que l&apos;exemplaire du client corresponde. Rien n&apos;est
                            perdu si vous fermez : elle reste imprimable depuis les factures.
                        </>
                    ),
                    printLabel: 'Réimprimer la facture',
                };
            default:
                return null;
        }
    }, [notice]);
    const detachedNotice = notice?.kind === 'DETACHED' ? notice : null;

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

            {/* Un avis qui se termine par « imprimez ce document » porte le bouton
                qui l'imprime — sinon il ne fait que renvoyer ailleurs. */}
            <BillPrintNoticeDialog notice={printNotice} onClose={acknowledgeNotice} />

            <Dialog open={!!detachedNotice} onOpenChange={(open) => { if (!open) acknowledgeNotice(); }}>
                <DialogContent className="bg-card border-border max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-amber-700 dark:text-amber-300">
                            Demande retirée du brouillon
                        </DialogTitle>
                    </DialogHeader>
                    <div className="text-foreground text-sm space-y-3">
                        <DialogDescription className="text-foreground text-sm">
                            En sortant cette demande de « Terminé », elle a été retirée de la facture
                            #{detachedNotice?.billId} (brouillon)
                            {detachedNotice?.newTotal ? `, dont le total est maintenant de ${formatEuro2(detachedNotice.newTotal)} €` : ''} :
                            c&apos;est le passage à « Terminé » qui l&apos;y avait mise. Elle rejoindra un
                            brouillon à nouveau le jour où elle sera terminée pour de bon.
                        </DialogDescription>
                        {detachedNotice && (
                            <Link
                                href={`/admin/bills?bill=${detachedNotice.billId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-blue-400 hover:text-blue-300 underline underline-offset-2"
                            >
                                Voir la facture #{detachedNotice.billId}
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
