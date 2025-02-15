// BookModalBackend.tsx
import React from 'react';
import { Plus } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AddBookFormBackend } from '@/admin/BookFormBackendBase';

interface BookModalBackendProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onBookAdded?: (bookId: number) => void;
}

export function BookModalBackend({ isOpen, onOpenChange, onBookAdded }: BookModalBackendProps) {
    const handleSuccess = (bookId: number) => {
        console.log('Book added successfully, closing modal');
        if (onBookAdded) {
            console.log('Calling onBookAdded callback with bookId:', bookId);
            onBookAdded(bookId);
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button>svg]:text-white">

                <DialogHeader>
                    <DialogTitle className="text-gray-100">Ajouter un nouveau livre</DialogTitle>
                </DialogHeader>
                <div className="overflow-y-auto px-1">
                    <AddBookFormBackend onSuccess={handleSuccess} />
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function AddBookButtonBackend({ onBookAdded }: { onBookAdded?: (bookId: number) => void }) {  // Update type here too
    const [isOpen, setIsOpen] = React.useState(false);

    const handleButtonClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(true);
    };

    return (
        <>
            <Button
                onClick={handleButtonClick}
                className="bg-gray-700 hover:bg-gray-600 text-gray-100"
                type="button"
            >
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un nouveau livre
            </Button>

            <BookModalBackend
                isOpen={isOpen}
                onOpenChange={setIsOpen}
                onBookAdded={onBookAdded}
            />
        </>
    );
}