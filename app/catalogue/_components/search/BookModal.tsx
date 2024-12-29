// app/catalogue/_components/search/BookModal.tsx
import React from 'react';
import { Book as BookType } from '@prisma/client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface BookWithGenres extends BookType {
    genres: {
        genre: {
            id: number;
            name: string;
        };
    }[];
}

interface BookModalProps {
    book: BookWithGenres | null;
    isOpen: boolean;
    onClose: () => void;
}

export const BookModal: React.FC<BookModalProps> = ({ book, isOpen, onClose }) => {
    if (!book) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{book.title}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <p className="text-gray-600">Author: {book.author}</p>
                        <div className="mt-2">
                            <p className="text-gray-600 mb-1">Genres:</p>
                            <div className="flex flex-wrap gap-1">
                                {book.genres.map(({ genre }) => (
                                    <span
                                        key={genre.id}
                                        className="bg-blue-100 text-blue-800 text-sm px-2 py-0.5 rounded-full"
                                    >
                    {genre.name}
                  </span>
                                ))}
                            </div>
                        </div>
                        {book.publishedDate && (
                            <p className="text-gray-600 mt-2">
                                Published: {new Date(book.publishedDate).toLocaleDateString()}
                            </p>
                        )}
                        {book.readingDurationMinutes && (
                            <p className="text-gray-600 mt-2">
                                Reading time: {book.readingDurationMinutes} minutes
                            </p>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold mb-2">Description</h3>
                        <p className="text-gray-600">{book.description || 'No description available.'}</p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};