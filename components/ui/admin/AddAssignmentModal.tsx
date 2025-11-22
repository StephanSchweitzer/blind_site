import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AddAssignmentFormBackend } from '@/admin/AssignmentFormBackendBase';
import { Loader2 } from 'lucide-react';

interface AddAssignmentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onAssignmentCreated?: (assignmentId: number) => void;
}

export function AddAssignmentModal({
                                       isOpen,
                                       onOpenChange,
                                       onAssignmentCreated,
                                   }: AddAssignmentModalProps) {
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);

    // Reset loading state when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsLoadingOrders(true);
        }
    }, [isOpen]);

    const handleSuccess = (assignmentId: number) => {
        console.log('Assignment created successfully, closing modal');
        if (onAssignmentCreated) {
            console.log('Calling onAssignmentCreated callback with assignmentId:', assignmentId);
            onAssignmentCreated(assignmentId);
        }
        onOpenChange(false);
    };

    const handleOrdersLoaded = useCallback(() => {
        setIsLoadingOrders(false);
    }, []);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Créer une nouvelle affectation</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1 relative">
                    {isLoadingOrders && (
                        <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
                            <div className="flex items-center">
                                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                                <span className="ml-3 text-gray-400">Chargement des commandes...</span>
                            </div>
                        </div>
                    )}
                    <AddAssignmentFormBackend
                        onSuccess={handleSuccess}
                        onOrdersLoaded={handleOrdersLoaded}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}