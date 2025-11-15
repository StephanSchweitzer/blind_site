import React, { useState, useCallback, useEffect } from 'react';
import { Book as BookType } from '@prisma/client';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Volume2, Filter, Clock, Calendar, User, X } from 'lucide-react';

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
    onGenreClick?: (genreId: number) => void;
    selectedGenres?: number[];
}

export const BookModal: React.FC<BookModalProps> = ({
                                                        book,
                                                        isOpen,
                                                        onClose,
                                                        onGenreClick,
                                                        selectedGenres = []
                                                    }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
                    setIsLoading(false);

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

    const handleGenreClick = useCallback((genreId: number) => {
        if (onGenreClick) {
            onGenreClick(genreId);
        }
    }, [onGenreClick]);

    if (!book) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col
                rounded-2xl
                bg-white/95 dark:bg-gray-800/95
                backdrop-blur-xl backdrop-saturate-150
                border-2 border-gray-200/50 dark:border-gray-600/60
                shadow-[0_20px_70px_rgb(0,0,0,0.15)] dark:shadow-[0_25px_80px_rgb(0,0,0,0.6)]
                animate-fade-in
                [&>[data-dialog-close]]:hidden">

                {/* Custom mobile-friendly close button */}
                <button
                    onClick={onClose}
                    type="button"
                    className="absolute top-2 right-2 z-50
                        w-12 h-12 sm:w-10 sm:h-10
                        flex items-center justify-center
                        rounded-full
                        bg-white dark:bg-gray-700
                        hover:bg-gray-100 dark:hover:bg-gray-600
                        text-gray-700 dark:text-gray-300
                        hover:text-gray-900 dark:hover:text-white
                        border-2 border-gray-300 dark:border-gray-600
                        shadow-lg hover:shadow-xl
                        transition-all duration-200
                        hover:scale-110
                        active:scale-95
                        focus:outline-none focus-visible:ring-0"
                    aria-label="Fermer"
                    tabIndex={-1}
                >
                    <X className="w-6 h-6 sm:w-5 sm:h-5 stroke-[2.5]" />
                </button>

                {/* Decorative gradient orbs */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/10 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <DialogHeader className="text-center flex-shrink-0 pb-4 pt-2 pr-14 sm:pr-12 border-b border-gray-200/50 dark:border-gray-700/50 relative z-10">
                    <DialogTitle className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight" role="heading" aria-level={1}>
                        {book.title}
                    </DialogTitle>
                    {book.subtitle && (
                        <p className="text-base sm:text-lg text-gray-700 dark:text-gray-300 mt-2">
                            {book.subtitle}
                        </p>
                    )}
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                        <div className="space-y-4">
                            {/* Author */}
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                <User className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5">Auteur</p>
                                    <p className="text-gray-900 dark:text-gray-100 font-medium">{book.author}</p>
                                </div>
                            </div>

                            {/* Genres */}
                            <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">Genres</p>
                                <div className="flex flex-wrap gap-2" role="list" aria-label="Genres du livre">
                                    {book.genres.map(({ genre }) => {
                                        const isSelected = selectedGenres.includes(genre.id);
                                        return (
                                            <button
                                                key={genre.id}
                                                onClick={() => handleGenreClick(genre.id)}
                                                disabled={isSelected}
                                                className={`
                                                    text-sm px-3 py-1.5 rounded-full 
                                                    transition-all duration-300
                                                    inline-flex items-center gap-1.5
                                                    font-medium
                                                    shadow-sm
                                                    ${isSelected
                                                    ? 'bg-gradient-to-r from-emerald-400 to-green-500 dark:from-emerald-600 dark:to-green-700 text-white cursor-not-allowed shadow-emerald-500/30'
                                                    : 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-purple-900/30 text-blue-700 dark:text-blue-300 hover:shadow-md hover:scale-105 cursor-pointer border border-blue-200/50 dark:border-blue-700/50'
                                                }
                                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
                                                `}
                                                role="listitem"
                                                aria-label={isSelected ? `Genre ${genre.name} déjà sélectionné` : `Cliquer pour filtrer par ${genre.name}`}
                                                title={isSelected ? 'Déjà dans les filtres' : 'Cliquer pour ajouter aux filtres'}
                                                tabIndex={-1}
                                            >
                                                {genre.name}
                                                {isSelected && <Filter className="w-3.5 h-3.5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Published Date */}
                            {book.publishedDate && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                    <Calendar className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5">Date de publication</p>
                                        <p className="text-gray-900 dark:text-gray-100 font-medium">
                                            {new Date(book.publishedDate).toLocaleDateString('fr-FR')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Duration */}
                            {book.readingDurationMinutes && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                    <Clock className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5">Durée de l&apos;enregistrement</p>
                                        <p className="text-gray-900 dark:text-gray-100 font-medium">
                                            {formatMinutes(book.readingDurationMinutes)}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Description Section */}
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Description</h3>
                                <div className="h-0.5 flex-1 bg-gradient-to-r from-blue-500/30 to-transparent dark:from-purple-500/30"></div>
                            </div>

                            <div
                                className={`${
                                    isExpanded ? 'max-h-48 sm:max-h-64 lg:max-h-80' : 'max-h-24 sm:max-h-32'
                                } overflow-y-auto pr-2 custom-scrollbar transition-all duration-300 flex-1 mb-3
                                    p-4 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm`}
                                role="region"
                                aria-label="Description du livre"
                            >
                                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm sm:text-base leading-relaxed">
                                    {book.description || 'Aucune description disponible.'}
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 mt-auto">
                                {book.description && book.description.length > 200 && (
                                    <button
                                        onClick={() => setIsExpanded(!isExpanded)}
                                        className="flex items-center justify-center gap-2
                                            text-blue-600 dark:text-purple-400
                                            hover:text-blue-700 dark:hover:text-purple-300
                                            font-medium text-sm
                                            px-4 py-2 rounded-lg
                                            bg-blue-50/50 dark:bg-purple-900/20
                                            hover:bg-blue-100/50 dark:hover:bg-purple-900/30
                                            border border-blue-200/50 dark:border-purple-700/50
                                            transition-all duration-300
                                            hover:shadow-md
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                        aria-label={isExpanded ? "Voir moins" : "Voir plus"}
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronUp className="w-4 h-4" />
                                                Voir moins
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown className="w-4 h-4" />
                                                Voir plus
                                            </>
                                        )}
                                    </button>
                                )}

                                <button
                                    onClick={() => isSpeaking ? stopSpeaking() : speak(generateFrenchText())}
                                    className={`
                                        flex items-center justify-center gap-2 px-6 py-3 
                                        text-sm sm:text-base font-semibold
                                        rounded-xl w-full
                                        transition-all duration-300
                                        shadow-lg
                                        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
                                        ${isSpeaking && !isLoading
                                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30 focus-visible:ring-red-500'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-purple-600 hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-purple-700 text-white shadow-blue-500/30 dark:shadow-purple-500/30 focus-visible:ring-blue-500'
                                    }
                                        ${isLoading ? 'cursor-not-allowed opacity-80' : 'hover:shadow-xl hover:scale-[1.02]'}
                                    `}
                                    disabled={isLoading}
                                    tabIndex={-1}
                                    aria-label={isSpeaking ? "Arrêter la lecture" : "Lire les informations en français"}
                                >
                                    {isLoading ? (
                                        <div className="relative">
                                            <div className="animate-spin rounded-full h-5 w-5 border-3 border-white/30"></div>
                                            <div className="absolute inset-0 animate-spin rounded-full h-5 w-5 border-3 border-transparent border-t-white"></div>
                                        </div>
                                    ) : (
                                        <>
                                            <Volume2 className="w-5 h-5" />
                                            {isSpeaking ? 'Arrêter la lecture' : 'Brève description'}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};