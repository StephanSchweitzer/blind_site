// EditBookModal.tsx
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
}

export function EditBookModal({
                                  isOpen,
                                  onOpenChange,
                                  bookId,
                                  initialData,
                                  onBookEdited
                              }: EditBookModalProps) {
    const handleSuccess = (bookId: number) => {
        console.log('Book edited successfully, closing modal');
        if (onBookEdited) {
            console.log('Calling onBookEdited callback with bookId:', bookId);
            onBookEdited(bookId);
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-3xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700"
            >
                <DialogHeader>
                    <DialogTitle className="text-gray-100">Modifier le livre</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
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