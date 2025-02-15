import React, { useState, useCallback, useEffect } from 'react';
import { Book as BookType } from '@prisma/client';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Volume2 } from 'lucide-react';

// Initialize AWS Polly
const pollyClient = new PollyClient({
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!
    }
});

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
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

    // Rest of the utility functions remain the same
    const formatMinutes = (minutes: number): string => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours === 0) return `${remainingMinutes} minutes`;
        if (remainingMinutes === 0) return `${hours} heure${hours > 1 ? 's' : ''}`;
        return `${hours} heure${hours > 1 ? 's' : ''} et ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    };

    const generateFrenchText = useCallback(() => {
        if (!book) return '';
        const description = book.description;
        const duration = book.readingDurationMinutes
            ? `Durée de l'enregistrement: ${formatMinutes(book.readingDurationMinutes)}. `
            : '';
        return `${book.title}. écrit par ${book.author}. ${duration}${description ? `Description: ${description}` : 'Aucune description disponible.'}`;
    }, [book]);

    useEffect(() => {
        return () => {
            if (audioElement) {
                audioElement.pause();
                audioElement.remove();
            }
        };
    }, [audioElement]);

    const speak = useCallback(async (text: string) => {
        try {
            setIsLoading(true);
            setIsSpeaking(true);
            // Split by sentences to create more natural chunks
            const sentences = text.split(/[.!?]+/);
            let currentChunk = '';
            const chunks = [];

            for (const sentence of sentences) {
                if ((currentChunk + sentence).length < 2800) {
                    currentChunk += sentence + '. ';
                } else {
                    chunks.push(currentChunk);
                    currentChunk = sentence + '. ';
                }
            }
            if (currentChunk) chunks.push(currentChunk);
            const audioUrls: string[] = [];

            for (const chunk of chunks) {
                const command = new SynthesizeSpeechCommand({
                    Engine: 'neural',
                    LanguageCode: 'fr-FR',
                    Text: chunk,
                    OutputFormat: 'mp3',
                    VoiceId: 'Lea'
                });

                const response = await pollyClient.send(command);
                const audioData = await response.AudioStream?.transformToByteArray();

                if (audioData) {
                    const blob = new Blob([audioData], { type: 'audio/mpeg' });
                    const url = URL.createObjectURL(blob);
                    audioUrls.push(url);
                }
            }

            let currentIndex = 0;
            const playNext = async () => {
                if (currentIndex < audioUrls.length) {
                    const audio = new Audio(audioUrls[currentIndex]);
                    setAudioElement(audio);
                    setIsLoading(false);  // Stop loading when first audio starts

                    audio.onended = () => {
                        URL.revokeObjectURL(audioUrls[currentIndex]);
                        currentIndex++;
                        playNext();
                        setIsLoading(false);
                    };

                    audio.onerror = (error: Event | string) => {
                        console.error('Audio playback error:', error);
                        if (typeof error !== 'string' && 'currentTarget' in error) {
                            console.error('Audio error details:', error.currentTarget);
                        }
                        setIsSpeaking(false);
                    };

                    try {
                        await audio.play();
                        console.log('Playback started for chunk:', currentIndex + 1);
                    } catch (error) {
                        console.error('Playback failed:', error);
                        setIsSpeaking(false);
                    }
                } else {
                    console.log('All chunks completed');
                    setIsSpeaking(false);
                    setAudioElement(null);
                }
            };

            playNext();
            setIsLoading(false);
        } catch (error) {
            console.error('Speech synthesis error:', error);
            setIsLoading(false);
            setIsSpeaking(false);
        }
    }, []);

    const stopSpeaking = useCallback(() => {
        if (audioElement) {
            audioElement.pause();
            audioElement.currentTime = 0;
        }
        setIsSpeaking(false);
        setAudioElement(null);
    }, [audioElement]);

    const [isLoading, setIsLoading] = useState(false);

    if (!book) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold" role="heading" aria-level={1}>
                        {book.title}
                    </DialogTitle>
                    <p className="text-lg text-gray-700 mt-1">
                        {book.subtitle}
                    </p>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <p className="text-gray-700" aria-label="Auteur">Auteur: {book.author}</p>
                        <div className="mt-2">
                            <p className="text-gray-700 mb-1">Genres:</p>
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
                            <p className="text-gray-700 mt-2" aria-label="Date de publication">
                                Date de publication: {new Date(book.publishedDate).toLocaleDateString('fr-FR')}
                            </p>
                        )}
                        {book.readingDurationMinutes && (
                            <p className="text-gray-700 mt-2" aria-label="Durée de lecture">
                                Durée de l&apos;enregistrement: {formatMinutes(book.readingDurationMinutes)}
                            </p>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold mb-2">Description</h3>
                        <div
                            className={`${isExpanded ? 'max-h-96' : 'max-h-32'} overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 transition-all duration-300`}
                            role="region"
                            aria-label="Description du livre"
                        >
                            <p className="text-gray-700">
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
                                onClick={() => isSpeaking ? stopSpeaking() : speak(generateFrenchText())}
                                className={`flex items-center justify-center px-4 py-2 ${
                                    isSpeaking && !isLoading ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                                } text-white rounded-lg relative w-48 h-10`}
                                disabled={isLoading}
                                aria-label={isSpeaking ? "Arrêter la lecture" : "Lire les informations en français"}
                            >
                                {isLoading ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
                                ) : (
                                    <>
                                        <Volume2 className="w-4 h-4 mr-2" />
                                        {isSpeaking ? 'Arrêter la lecture' : 'Lire en français'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};