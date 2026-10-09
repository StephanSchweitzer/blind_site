import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditBookFormBackend } from '@/admin/BookFormBackendBase';
import { CopyableId } from '@/admin/CopyableId';
import { BookFormData } from '@/admin/BookFormBackendBase';
import { FormLoadingGate } from '@/components/ui/form-skeleton';

interface EditBookModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: string;
    /** Null while the fiche loads: the modal shows its skeleton, the form isn't mounted. */
    initialData: BookFormData | null;
    error?: string | null;
    onBookEdited?: (bookId: number) => void;
    onBookDeleted?: (bookId: number) => void;
}

export function EditBookModal({
                                  isOpen,
                                  onOpenChange,
                                  bookId,
                                  initialData,
                                  error,
                                  onBookEdited,
                                  onBookDeleted
                              }: EditBookModalProps) {
    const handleSuccess = (bookId: number, isDeleted?: boolean) => {
        if (isDeleted) onBookDeleted?.(bookId);
        else onBookEdited?.(bookId);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col overflow-hidden bg-card border-border [&>button>svg]:text-white">

                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="text-foreground flex flex-wrap items-center gap-2">
                        Modifier le livre
                        {bookId && <CopyableId id={bookId} label="du livre" />}
                    </DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1">
                    <FormLoadingGate loading={!initialData} error={error} fields={8}>
                        {initialData && (
                            <EditBookFormBackend
                                bookId={bookId}
                                initialData={initialData}
                                onSuccess={handleSuccess}
                            />
                        )}
                    </FormLoadingGate>
                </div>
            </DialogContent>
        </Dialog>
    );
}