import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditOrderFormBackend } from '@/admin/OrderFormBackendBase';
import { OrderFormData } from '@/admin/OrderFormBackendBase';

interface User {
    id: number;
    name: string | null;
    email: string;
}

interface Book {
    id: number;
    title: string;
    author: string;
}

interface EditOrderModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    initialData: OrderFormData;
    onOrderEdited?: (orderId: number) => void;
    onOrderDeleted?: (orderId: number) => void;
    // Pre-fetched selections
    initialSelectedUser?: User | null;
    initialSelectedBook?: Book | null;
    initialSelectedStaff?: User | null;
    // Linked bill (read-only context)
    initialBill?: { id: number; state: string } | null;
}

export function EditOrderModal({
                                   isOpen,
                                   onOpenChange,
                                   orderId,
                                   initialData,
                                   onOrderEdited,
                                   onOrderDeleted,
                                   initialSelectedUser,
                                   initialSelectedBook,
                                   initialSelectedStaff,
                                   initialBill,
                               }: EditOrderModalProps) {
    const handleSuccess = (orderId: number, isDeleted?: boolean) => {
        if (isDeleted) {
            if (onOrderDeleted) {
                onOrderDeleted(orderId);
            }
        } else {
            if (onOrderEdited) {
                onOrderEdited(orderId);
            }
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Modifier la demande</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <EditOrderFormBackend
                        orderId={orderId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                        initialSelectedUser={initialSelectedUser}
                        initialSelectedBook={initialSelectedBook}
                        initialSelectedStaff={initialSelectedStaff}
                        initialBill={initialBill}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}