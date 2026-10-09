import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { AddAssignmentFormBackend } from '@/admin/AddAssignmentFormBackend';
import type { ReaderSummary, UserSummary } from '@/types';

interface AddAssignmentModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onAssignmentCreated?: (assignmentId: number) => void;
    presetClientId?: number | null;
    presetReader?: ReaderSummary | null;
    presetClient?: UserSummary | null;
}

export function AddAssignmentModal({
                                       isOpen,
                                       onOpenChange,
                                       onAssignmentCreated,
                                       presetClientId,
                                       presetReader,
                                       presetClient,
                                   }: AddAssignmentModalProps) {
    const handleSuccess = (assignmentId: number) => {
        console.log('Assignment created successfully, closing modal');
        if (onAssignmentCreated) {
            console.log('Calling onAssignmentCreated callback with assignmentId:', assignmentId);
            onAssignmentCreated(assignmentId);
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80dvh] overflow-y-auto bg-card border-border [&>button>svg]:text-white">
                <DialogHeader>
                    <DialogTitle className="text-foreground">Créer une nouvelle attribution</DialogTitle>
                </DialogHeader>
                {/* Rien à attendre : les statuts viennent du layout (useReferenceData),
                    et le choix de la demande charge sa propre liste à l'ouverture. */}
                <div className="overflow-y-auto px-1">
                    <AddAssignmentFormBackend
                        onSuccess={handleSuccess}
                        presetClientId={presetClientId}
                        initialReader={presetReader}
                        presetClient={presetClient}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}