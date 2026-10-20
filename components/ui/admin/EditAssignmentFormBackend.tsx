import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ReaderSummary, BookSummary, OrderSummary, AssignmentFormData, AssignmentReaderHistory } from '@/types';
import { AssignmentFormBackendBase, type AssignmentSubmitOptions } from '@/admin/AssignmentFormBackendBase';
import { getFieldErrorLines, ErrorToastBody, AudioConfirmationRequiredError } from '@/admin/AssignmentFormErrors';

/** What finishing this attribution did to its demande — see PUT /api/assignments/[id]. */
type BillDetached = {
    orderId: number;
    billId: number;
    newTotal: string;
};

type OrderTransition = {
    orderId: number;
    awaitingShipment: boolean;
    billable: boolean;
};

// Edit Assignment Form using the base
export function EditAssignmentFormBackend({
                                              assignmentId,
                                              initialData,
                                              onSuccess,
                                              initialSelectedReader,
                                              initialSelectedBook,
                                              initialSelectedOrder,
                                              initialReaderHistory,
                                          }: {
    assignmentId: string;
    initialData: AssignmentFormData;
    onSuccess?: (assignmentId: number, isDeleted?: boolean) => void;
    initialSelectedReader?: ReaderSummary | null;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
    initialReaderHistory: AssignmentReaderHistory[];
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
                title: "Succès",
                description: "L'attribution a été supprimée avec succès",
                className: "bg-green-100 border-green-500 text-green-900"
            });

            if (onSuccess) {
                onSuccess(parseInt(assignmentId), true);
            }
        } catch (error) {
            console.error('Delete error:', error);
            throw error;
        }
    };

    const handleSubmit = async (
        formData: AssignmentFormData,
        _readerId?: number | null,
        options?: AssignmentSubmitOptions
    ): Promise<number> => {
        try {
            // For updates, we DON'T include readerId - it's handled via reassignment
            const response = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...formData, ...options }), // No readerId in update
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.message || 'Échec de la mise à jour de l\'attribution';
                if (errorData?.requiresAudioConfirmation) {
                    return Promise.reject(new AudioConfirmationRequiredError(errorMessage));
                }
                const fieldLines = getFieldErrorLines(errorData);

                toast({
                    variant: "destructive",
                    title: "Erreur",
                    description: <ErrorToastBody message={errorMessage} lines={fieldLines} />
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
            // L'audio est revenu : les duplications ouvertes du même livre peuvent
            // être faites — qu'elles l'aient attendu ou non, avec ou sans demande liée.
            const openDuplicationIds: number[] = payload?.openDuplicationIds ?? [];

            // Quand l'attribution vient de passer la demande à « Attente envoi vers
            // auditeur », c'est CE toast qui le dit, avec le bouton qui mène à la demande.
            const awaitingOrderId = orderTransition?.awaitingShipment ? orderTransition.orderId : null;

            toast({
                title: awaitingOrderId != null ? `Attribution n° ${assignmentId} clôturée` : "Succès",
                action: awaitingOrderId != null ? (
                    <ToastAction
                        altText="Consulter la demande"
                        asChild
                        className="h-9 gap-2 border-green-600 bg-white px-4 text-base font-semibold text-green-900 hover:bg-green-200"
                    >
                        <a
                            href={`/admin/orders?order=${awaitingOrderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Consulter la demande
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </a>
                    </ToastAction>
                ) : undefined,
                description: (
                    <span className="block">
                        {awaitingOrderId == null && <>L&apos;attribution a été mise à jour avec succès</>}
                        {awaitingOrderId != null && (
                            <span className="block text-base">
                                La demande n°{' '}
                                <a
                                    href={`/admin/orders?order=${awaitingOrderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold underline underline-offset-2"
                                >
                                    {awaitingOrderId}
                                </a>{' '}
                                est passée en « Attente envoi vers auditeur ».
                                {/* Renseigner la date de clôture le jour de l'expédition : c'est
                                    elle qui facture (accrueOrderToOpenDraft). */}
                                {orderTransition?.billable && (
                                    <> Elle sera facturée à sa clôture, le jour de l&apos;expédition.</>
                                )}
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
                        {openDuplicationIds.length > 0 && (
                            <span className="mt-2 block text-base">
                                {openDuplicationIds.length === 1
                                    ? 'Une duplication de ce livre peut maintenant être faite : '
                                    : `${openDuplicationIds.length} duplications de ce livre peuvent maintenant être faites : `}
                                {openDuplicationIds.map((dupId, i) => (
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
                className: "bg-green-100 border-green-500 text-green-900"
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
            onSuccess={onSuccess}
            initialSelectedReader={initialSelectedReader}
            initialSelectedBook={initialSelectedBook}
            initialSelectedOrder={initialSelectedOrder}
            initialReaderHistory={initialReaderHistory}
        />
    );
}
