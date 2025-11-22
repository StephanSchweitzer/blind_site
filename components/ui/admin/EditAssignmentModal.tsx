import React from 'react';
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

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Modifier l&apos;affectation</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <EditAssignmentFormBackend
                        assignmentId={assignmentId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                        initialSelectedReader={initialSelectedReader}
                        initialSelectedBook={initialSelectedBook}
                        initialSelectedOrder={initialSelectedOrder}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}