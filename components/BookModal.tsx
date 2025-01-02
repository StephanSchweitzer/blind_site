import React, { useState } from 'react';
import { Book as BookType } from '@prisma/client';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Volume2 } from 'lucide-react';

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
    const [isExpanded, setIsExpanded] = useState(false);

    if (!book) return null;

    const formatMinutes = (minutes: number): string => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours === 0) return `${remainingMinutes} minutes`;
        if (remainingMinutes === 0) return `${hours} heure${hours > 1 ? 's' : ''}`;
        return `${hours} heure${hours > 1 ? 's' : ''} et ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    };

    const generateFrenchText = () => {
        console.log(book)
        const genres = book.genres.map(g => g.genre.name).join(' et ');
        const description = book.description;
        const duration = book.readingDurationMinutes
            ? `Durée de l'enregistrement: ${formatMinutes(book.readingDurationMinutes)}. `
            : '';
        return `${book.title}, écrit par ${book.author}. Ce livre appartient aux genres suivants: ${genres}. ${duration}${description ? `Description: ${description}` : 'Aucune description disponible.'}`;
    };

    const speak = (text: string, lang = 'fr-FR') => {
        if (!('speechSynthesis' in window)) return;

        try {
            window.speechSynthesis.cancel();

            let sentences: string[] = text.match(/[^.!?]+[.!?]+/g) || [];

            if (sentences.join('').length < text.length) {
                const remainingText = text.replace(sentences.join(''), '').trim();
                if (remainingText) {
                    sentences.push(remainingText);
                }
            }

            if (sentences.length === 0) {
                sentences = [text];
            }

            sentences.forEach((sentence, index) => {
                const utterance = new SpeechSynthesisUtterance(sentence.trim());
                utterance.lang = lang;

                utterance.onerror = (event: SpeechSynthesisErrorEvent) => {
                    if (event.error !== 'interrupted') {
                        console.error(`Speech error: ${event.error}`);
                    }
                };

                window.speechSynthesis.speak(utterance);
            });
        } catch (error) {
            console.error('Speech synthesis error:', error);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold" role="heading" aria-level={1}>
                        {book.title}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <p className="text-gray-600" aria-label="Auteur">Auteur: {book.author}</p>
                        <div className="mt-2">
                            <p className="text-gray-600 mb-1">Genres:</p>
                            <div className="flex flex-wrap gap-1" role="list" aria-label="Genres du livre">
                                {book.genres.map(({ genre }) => (
                                    <span
                                        key={genre.id}
                                        className="bg-blue-100 text-blue-800 text-sm px-2 py-0.5 rounded-full"
                                        role="listitem"
                                    >
                                        {genre.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {book.publishedDate && (
                            <p className="text-gray-600 mt-2" aria-label="Date de publication">
                                Date de publication: {new Date(book.publishedDate).toLocaleDateString('fr-FR')}
                            </p>
                        )}
                        {book.readingDurationMinutes && (
                            <p className="text-gray-600 mt-2" aria-label="Durée de lecture">
                                Durée de l'enregistrement: {formatMinutes(book.readingDurationMinutes)}
                            </p>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold mb-2">Description</h3>
                        <div
                            className={`${isExpanded ? 'max-h-96' : 'max-h-32'} overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 transition-all duration-300`}
                            role="region"
                            aria-label="Description du livre"
                            aria-expanded={isExpanded}
                        >
                            <p className="text-gray-600">
                                {book.description || 'Aucune description disponible.'}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                            {book.description && book.description.length > 200 ? (
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="flex items-center text-blue-600 hover:text-blue-800"
                                    aria-label={isExpanded ? "Voir moins" : "Voir plus"}
                                >
                                    {isExpanded ? (
                                        <>
                                            <ChevronUp className="w-4 h-4 mr-1" />
                                            Voir moins
                                        </>
                                    ) : (
                                        <>
                                            <ChevronDown className="w-4 h-4 mr-1" />
                                            Voir plus
                                        </>
                                    )}
                                </button>
                            ) : null}
                            <button
                                onClick={() => speak(generateFrenchText())}
                                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                aria-label="Lire les informations en français"
                            >
                                <Volume2 className="w-4 h-4 mr-2" />
                                Lire en français
                            </button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};