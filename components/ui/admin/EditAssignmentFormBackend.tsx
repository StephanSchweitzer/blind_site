import React from 'react';
import { useToast } from "@/hooks/use-toast";
import { ReaderSummary, BookSummary, OrderSummary, AssignmentFormData } from '@/types';
import { AssignmentFormBackendBase } from '@/admin/AssignmentFormBackendBase';
import { getFieldErrorLines, ErrorToastBody } from '@/admin/AssignmentFormErrors';

/** What finishing this attribution did to its demande — see PUT /api/assignments/[id]. */
type BillDetached = {
    orderId: number;
    billId: number;
    newTotal: string;
};

type OrderTransition = {
    orderId: number;
    awaitingShipment: boolean;
    freedDuplicationIds: number[];
};

// Edit Assignment Form using the base
export function EditAssignmentFormBackend({
                                              assignmentId,
                                              initialData,
                                              onSuccess,
                                              initialSelectedReader,
                                              initialSelectedBook,
                                              initialSelectedOrder,
                                              onReadersLoaded,
                                              onOrdersLoaded,
                                          }: {
    assignmentId: string;
    initialData: AssignmentFormData;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    initialSelectedReader?: ReaderSummary | null;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
    onReadersLoaded?: () => void;
    onOrdersLoaded?: () => void;
}) {
    const { toast } = useToast();

    const handleDelete = async (): Promise<void> => {
        try {
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error('Échec de la suppression de l\'attribution');
            }

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: <span className="text-xl mt-2">L&apos;attribution a été supprimée avec succès</span>,
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            if (onSuccess) {
                onSuccess(parseInt(assignmentId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (formData: AssignmentFormData): Promise<number> => {
        try {
            // For updates, we DON'T include readerId - it's handled via reassignment
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData), // No readerId in update
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.message || 'Échec de la mise à jour de l\'attribution';
                const fieldLines = getFieldErrorLines(errorData);

                toast({
                    variant: "destructive",
                    // @ts-expect-error jsx in toast
                    title: <span className="text-2xl font-bold">Erreur</span>,
                    description: <ErrorToastBody message={errorMessage} lines={fieldLines} />,
                    className: "bg-red-100 border-2 border-red-500 text-red-900 shadow-lg p-6"
                });

                return Promise.reject();
            }

            // Finishing an attribution no longer closes its demande — it leaves it
            // « Attente envoi vers auditeur ». Say so here, with the link that closes
            // it: the safe state is automatic, the fast path is one click away, and
            // neither depends on anyone answering a question correctly at 17 h.
            const payload = await response.json().catch(() => null);
            const orderTransition: OrderTransition | null = payload?.orderTransition ?? null;
            // Rouvrir une attribution rouvre sa demande : si celle-ci figurait sur un
            // brouillon, elle vient d'en sortir (une facture émise, elle, aurait fait
            // échouer la requête plus haut). Le dire ici, pas dans le journal.
            const billDetached: BillDetached | null = payload?.billDetached ?? null;

            toast({
                // @ts-expect-error jsx in toast
                title: <span className="text-2xl font-bold">Succès</span>,
                description: (
                    <span className="text-xl mt-2 block">
                        L&apos;attribution a été mise à jour avec succès
                        {orderTransition?.awaitingShipment && (
                            <span className="mt-2 block text-base">
                                La demande{' '}
                                <a
                                    href={`/admin/orders?order=${orderTransition.orderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold underline underline-offset-2"
                                >
                                    #{orderTransition.orderId}
                                </a>{' '}
                                passe « Attente envoi vers auditeur » : passez-la « Terminé »
                                une fois l&apos;audio expédié.
                            </span>
                        )}
                        {billDetached && (
                            <span className="mt-2 block text-base">
                                La demande{' '}
                                <a
                                    href={`/admin/orders?order=${billDetached.orderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold underline underline-offset-2"
                                >
                                    #{billDetached.orderId}
                                </a>{' '}
                                a été retirée de la facture #{billDetached.billId} (brouillon), dont le
                                total est maintenant de {billDetached.newTotal} € : elle n&apos;est plus
                                terminée. Elle y reviendra le jour où elle le sera.
                            </span>
                        )}
                        {!!orderTransition?.freedDuplicationIds.length && (
                            <span className="mt-2 block text-base">
                                {orderTransition.freedDuplicationIds.length === 1
                                    ? 'Une duplication attendait cet enregistrement et devient réalisable : '
                                    : `${orderTransition.freedDuplicationIds.length} duplications attendaient cet enregistrement et deviennent réalisables : `}
                                {orderTransition.freedDuplicationIds.map((dupId, i) => (
                                    <React.Fragment key={dupId}>
                                        {i > 0 && ', '}
                                        <a
                                            href={`/admin/orders?order=${dupId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-semibold underline underline-offset-2"
                                        >
                                            #{dupId}
                                        </a>
                                    </React.Fragment>
                                ))}
                            </span>
                        )}
                    </span>
                ),
                className: "bg-green-100 border-2 border-green-500 text-green-900 shadow-lg p-6"
            });

            return parseInt(assignmentId);
        } catch (error) {
            console.error('Submit error:', error);
            return Promise.reject();
        }
    };

    return (
        <AssignmentFormBackendBase
            assignmentId={assignmentId}
            initialData={initialData}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
            showDelete={true}
            submitButtonText="Mettre à jour l'attribution"
            loadingText="Mise à jour en cours..."
            title="Modifier l'attribution"
            onSuccess={onSuccess}
            initialSelectedReader={initialSelectedReader}
            initialSelectedBook={initialSelectedBook}
            initialSelectedOrder={initialSelectedOrder}
            onReadersLoaded={onReadersLoaded}
            onOrdersLoaded={onOrdersLoaded}
        />
    );
}
