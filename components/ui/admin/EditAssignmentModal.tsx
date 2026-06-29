import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditAssignmentFormBackend } from '@/admin/AssignmentFormBackendBase';
import {
    AssignmentFormData,
    BookSummary,
    OrderSummary,
    ReaderSummary,
} from '@/types';
import { Loader2 } from 'lucide-react';

interface EditAssignmentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    assignmentId: string;
    initialData: AssignmentFormData;
    onAssignmentEdited?: (assignmentId: number) => void;
    onAssignmentDeleted?: (assignmentId: number) => void;

    initialSelectedReader?: ReaderSummary | null | undefined;
    initialSelectedBook?: BookSummary | null;
    initialSelectedOrder?: OrderSummary | null;
}

export function EditAssignmentModal({
                                        isOpen,
                                        onOpenChange,
                                        assignmentId,
                                        initialData,
                                        onAssignmentEdited,
                                        onAssignmentDeleted,
                                        initialSelectedReader,
                                        initialSelectedBook,
                                        initialSelectedOrder,
                                    }: EditAssignmentModalProps) {
    const [isLoadingReaders, setIsLoadingReaders] = useState(true);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);

    const [wasOpen, setWasOpen] = useState(isOpen);
    if (isOpen && !wasOpen) {
        setIsLoadingReaders(true);
        setIsLoadingOrders(true);
    }
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
    }

    const handleSuccess = (assignmentId: number, isDeleted?: boolean) => {
        console.log('Assignment operation completed successfully, closing modal');
        if (isDeleted) {
            if (onAssignmentDeleted) {
                console.log('Calling onAssignmentDeleted callback with assignmentId:', assignmentId);
                onAssignmentDeleted(assignmentId);
            }
        } else {
            if (onAssignmentEdited) {
                console.log('Calling onAssignmentEdited callback with assignmentId:', assignmentId);
                onAssignmentEdited(assignmentId);
            }
        }
        onOpenChange(false);
    };

    const handleReadersLoaded = useCallback(() => {
        setIsLoadingReaders(false);
    }, []);

    const handleOrdersLoaded = useCallback(() => {
        setIsLoadingOrders(false);
    }, []);

    const isLoading = isLoadingReaders || isLoadingOrders;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Modifier l&apos;attribution</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1 relative">
                    {isLoading && (
                        <div className="absolute inset-0 bg-card/80 backdrop-blur-sm z-50 flex items-center justify-center">
                            <div className="flex items-center">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                <span className="ml-3 text-muted-foreground">
                                    {isLoadingReaders && isLoadingOrders ? 'Chargement...' :
                                        isLoadingReaders ? 'Chargement des lecteurs...' :
                                            'Chargement des demandes...'}
                                </span>
                            </div>
                        </div>
                    )}
                    <EditAssignmentFormBackend
                        assignmentId={assignmentId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                        initialSelectedReader={initialSelectedReader}
                        initialSelectedBook={initialSelectedBook}
                        initialSelectedOrder={initialSelectedOrder}
                        onReadersLoaded={handleReadersLoaded}
                        onOrdersLoaded={handleOrdersLoaded}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}