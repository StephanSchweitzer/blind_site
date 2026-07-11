import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { EditBookFormBackend } from '@/admin/BookFormBackendBase';
import { BookFormData } from '@/admin/BookFormBackendBase';

interface EditBookModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    bookId: string;
    initialData: BookFormData;
    onBookEdited?: (bookId: number) => void;
    onBookDeleted?: (bookId: number) => void;
}

export function EditBookModal({
                                  isOpen,
                                  onOpenChange,
                                  bookId,
                                  initialData,
                                  onBookEdited,
                                  onBookDeleted
                              }: EditBookModalProps) {
    const handleSuccess = (bookId: number, isDeleted?: boolean) => {
        console.log('Book operation completed successfully, closing modal');
        if (isDeleted) {
            if (onBookDeleted) {
                console.log('Calling onBookDeleted callback with bookId:', bookId);
                onBookDeleted(bookId);
            }
        } else {
            if (onBookEdited) {
                console.log('Calling onBookEdited callback with bookId:', bookId);
                onBookEdited(bookId);
            }
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col overflow-hidden bg-card border-border [&>button>svg]:text-white">

                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="text-foreground">Modifier le livre</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-1">
                    <EditBookFormBackend
                        bookId={bookId}
                        initialData={initialData}
                        onSuccess={handleSuccess}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}