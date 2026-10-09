import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditAssignmentFormBackend } from '@/admin/EditAssignmentFormBackend';
import { CopyableId } from '@/admin/CopyableId';
import {
    AssignmentFormData,
    AssignmentReaderHistory,
    BookSummary,
    OrderSummary,
    ReaderSummary,
} from '@/types';
import { FormLoadingGate } from '@/components/ui/form-skeleton';

/** Everything the edit form needs at mount, from one GET /api/assignments/[id]. */
export interface LoadedAssignment {
    data: AssignmentFormData;
    selectedReader: ReaderSummary | null;
    selectedBook: BookSummary;
    selectedOrder: OrderSummary | null;
    /** Newest first; the first entry is the current reader. */
    readerHistory: AssignmentReaderHistory[];
}

const formatDateForForm = (date: string | Date | null | undefined): string | null => {
    if (!date) return null;
    if (typeof date === 'string') {
        return date.split('T')[0];
    }
    return date.toISOString().split('T')[0];
};

export async function loadAssignmentForEdit(assignmentId: string, signal: AbortSignal): Promise<LoadedAssignment> {
    // The route includes the whole reader history (assignmentIncludeConfigs.all),
    // the same rows GET /api/assignments/[id]/readers returns.
    const response = await fetch(`/api/assignments/${assignmentId}`, { signal });
    if (!response.ok) throw new Error(`GET /api/assignments/${assignmentId}: ${response.status}`);
    const assignmentData = await response.json();

    const readerHistory: AssignmentReaderHistory[] = assignmentData.readerHistory ?? [];
    const currentReader = readerHistory[0]?.reader || null;

    return {
        data: {
            catalogueId: assignmentData.catalogueId,
            orderId: assignmentData.orderId,
            receptionDate: formatDateForForm(assignmentData.receptionDate),
            sentToReaderDate: formatDateForForm(assignmentData.sentToReaderDate),
            returnedToECADate: formatDateForForm(assignmentData.returnedToECADate),
            statusId: assignmentData.statusId,
            notes: assignmentData.notes || '',
            deliveryMethod: assignmentData.deliveryMethod ?? null,
        },
        selectedReader: currentReader ? {
            id: currentReader.id,
            email: currentReader.email,
            firstName: currentReader.firstName,
            lastName: currentReader.lastName,
        } : null,
        selectedBook: {
            id: assignmentData.catalogue.id,
            title: assignmentData.catalogue.title,
            author: assignmentData.catalogue.author,
        },
        selectedOrder: assignmentData.order ? {
            id: assignmentData.order.id,
            requestReceivedDate: assignmentData.order.requestReceivedDate,
            createdDate: assignmentData.order.createdDate,
            pages: assignmentData.order.pages,
            aveugle: assignmentData.order.aveugle,
            catalogue: assignmentData.order.catalogue,
        } as OrderSummary : null,
        readerHistory,
    };
}

interface EditAssignmentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    assignmentId: string;
    /** Null while the attribution loads: the modal shows its skeleton, the form isn't mounted. */
    assignment: LoadedAssignment | null;
    error?: string | null;
    onAssignmentDeleted?: (assignmentId: number) => void;
}

export function EditAssignmentModal({
                                        isOpen,
                                        onOpenChange,
                                        assignmentId,
                                        assignment,
                                        error,
                                        onAssignmentDeleted,
                                    }: EditAssignmentModalProps) {
    const handleSuccess = (assignmentId: number, isDeleted?: boolean) => {
        if (isDeleted) onAssignmentDeleted?.(assignmentId);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
                        Modifier l&apos;attribution
                        {assignmentId && <CopyableId id={assignmentId} label="de l'attribution" />}
                    </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <FormLoadingGate loading={!assignment} error={error} fields={7}>
                        {assignment && (
                            <EditAssignmentFormBackend
                                assignmentId={assignmentId}
                                initialData={assignment.data}
                                onSuccess={handleSuccess}
                                initialSelectedReader={assignment.selectedReader}
                                initialSelectedBook={assignment.selectedBook}
                                initialSelectedOrder={assignment.selectedOrder}
                                initialReaderHistory={assignment.readerHistory}
                            />
                        )}
                    </FormLoadingGate>
                </div>
            </DialogContent>
        </Dialog>
    );
}
