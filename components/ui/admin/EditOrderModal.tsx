import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditOrderFormBackend } from '@/admin/EditOrderFormBackend';
import { CopyableId } from '@/admin/CopyableId';
import type { OrderAssignment, OrderFormData, User, Book } from '@/admin/OrderFormBackendBase';
import { FormLoadingGate } from '@/components/ui/form-skeleton';
import { pagePricingFromRow } from '@/lib/orders/pagePricingForm';
import type { SerializedOrderTableRow } from '@/types/models/order.model';

/** Everything the edit form needs at mount, from one GET /api/orders/[id]. */
export interface LoadedOrder {
    data: OrderFormData;
    selectedUser: User | null;
    selectedBook: Book | null;
    selectedStaff: User | null;
    bill: { id: number; state: string } | null;
    assignment: OrderAssignment | null;
    /** ISO string when this demande is soft-deleted; null otherwise. */
    deletedAt: string | null;
}

type OrderResponse = SerializedOrderTableRow & {
    deletedAt: string | null;
    aveugle: User | null;
    catalogue: Book | null;
    processedByStaff: User | null;
    assignment: OrderAssignment | null;
};

export async function loadOrderForEdit(orderId: string, signal: AbortSignal): Promise<LoadedOrder> {
    // mode=full returns every scalar column, deletedAt included — a soft-deleted
    // demande doesn't 404 here (GET /api/orders/[id]), so it opens with its banner.
    const response = await fetch(
        `/api/orders/${orderId}?mode=full&include=bill,client,book,staff,assignment`,
        { signal }
    );
    if (!response.ok) throw new Error(`GET /api/orders/${orderId}: ${response.status}`);
    const order: OrderResponse = await response.json();

    return {
        data: {
            aveugleId: order.aveugleId,
            catalogueId: order.catalogueId,
            requestReceivedDate: new Date(order.requestReceivedDate),
            statusId: order.statusId,
            isDuplication: order.isDuplication,
            mediaFormatId: order.mediaFormatId,
            deliveryMethod: order.deliveryMethod,
            processedByStaffId: order.processedByStaffId,
            closureDate: order.closureDate ? new Date(order.closureDate) : null,
            cost: order.cost?.toString() || '0.00',
            pagePricing: pagePricingFromRow(order),
            billingStatus: order.billingStatus,
            lentPhysicalBook: order.lentPhysicalBook,
            notes: order.notes || '',
        },
        selectedUser: order.aveugle,
        selectedBook: order.catalogue,
        selectedStaff: order.processedByStaff,
        bill: order.bill ?? null,
        assignment: order.assignment,
        deletedAt: order.deletedAt ?? null,
    };
}

interface EditOrderModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    /** Null while the demande loads: the modal shows its skeleton, the form isn't mounted. */
    order: LoadedOrder | null;
    error?: string | null;
}

export function EditOrderModal({
                                   isOpen,
                                   onOpenChange,
                                   orderId,
                                   order,
                                   error,
                               }: EditOrderModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
                        {order?.deletedAt ? 'Demande supprimée' : 'Modifier la demande'}
                        {orderId && <CopyableId id={orderId} label="de la demande" />}
                    </DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <FormLoadingGate loading={!order} error={error} fields={8}>
                        {order && (
                            <EditOrderFormBackend
                                orderId={orderId}
                                initialData={order.data}
                                onSuccess={() => onOpenChange(false)}
                                initialSelectedUser={order.selectedUser}
                                initialSelectedBook={order.selectedBook}
                                initialSelectedStaff={order.selectedStaff}
                                initialBill={order.bill}
                                initialAssignment={order.assignment}
                                deletedAt={order.deletedAt}
                                onRestored={() => onOpenChange(false)}
                            />
                        )}
                    </FormLoadingGate>
                </div>
            </DialogContent>
        </Dialog>
    );
}
