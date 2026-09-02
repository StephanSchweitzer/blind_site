import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BookWithGenres } from '@/types/book';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Volume2, Filter, Clock, Calendar, User, X } from 'lucide-react';
import { formatCalendarDate } from '@/lib/calendar-date';

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
    const [isLoading, setIsLoading] = useState(false);
    // Spoken feedback for the Polly button. The button's own label changes too,
    // but a screen reader only re-reads the label if focus happens to be on it —
    // this status region announces the state change either way (RGAA 7.4).
    const [speechStatus, setSpeechStatus] = useState('');
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const formatMinutes = (minutes: number): string => {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours === 0) return `${remainingMinutes} minutes`;
        if (remainingMinutes === 0) return `${hours} heure${hours > 1 ? 's' : ''}`;
        return `${hours} heure${hours > 1 ? 's' : ''} et ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
    };

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
        };
    }, []);

    const speak = useCallback(async () => {
        if (!book) return;
        try {
            setIsLoading(true);
            setIsSpeaking(true);
            setSpeechStatus('Préparation de la lecture audio…');

            // Stop any in-flight playback before starting a new one.
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const response = await fetch('/api/polly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId: book.id }),
            });

            if (!response.ok) throw new Error('Polly API error');

            const { audioUrl } = await response.json();
            if (!audioUrl) throw new Error('No audio URL returned');

            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
                setIsSpeaking(false);
                setSpeechStatus('Lecture terminée.');
                audioRef.current = null;
            };

            audio.onerror = () => {
                console.error('Audio playback error');
                setIsSpeaking(false);
                setSpeechStatus("La lecture audio n'a pas pu démarrer.");
                audioRef.current = null;
            };

            setIsLoading(false);
            setSpeechStatus('Lecture en cours.');
            await audio.play();
        } catch (error) {
            console.error('Speech synthesis error:', error);
            setIsLoading(false);
            setIsSpeaking(false);
            setSpeechStatus("La lecture audio n'a pas pu démarrer.");
            audioRef.current = null;
        }
    }, [book]);

    const stopSpeaking = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }
        setIsSpeaking(false);
        setSpeechStatus('Lecture arrêtée.');
    }, []);

    const handleGenreClick = useCallback((genreId: number) => {
        if (onGenreClick) {
            onGenreClick(genreId);
        }
    }, [onGenreClick]);

    if (!book) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl w-[95vw] max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] overflow-hidden flex flex-col
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
                        active:scale-95"
                    aria-label="Fermer la fiche du livre"
                >
                    <X aria-hidden="true" className="w-6 h-6 sm:w-5 sm:h-5 stroke-[2.5]" />
                </button>

                {/* Decorative gradient orbs */}
                <div aria-hidden="true" className="absolute top-0 right-0 w-48 h-48 bg-blue-400/10 dark:bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div aria-hidden="true" className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/10 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <DialogHeader className="text-center flex-shrink-0 pb-4 pt-2 pr-14 sm:pr-12 border-b border-gray-200/50 dark:border-gray-700/50 relative z-10">
                    {/* Radix renders this as the dialog's accessible name. It used to
                        carry role="heading" aria-level={1}, which planted a second h1
                        inside a page that already has one and broke the heading order
                        (RGAA 9.1) — the native heading role is enough. */}
                    <DialogTitle className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {book.title}
                    </DialogTitle>
                    {book.subtitle && (
                        <p className="text-base sm:text-lg text-gray-700 dark:text-gray-300 mt-2">
                            {book.subtitle}
                        </p>
                    )}
                    <DialogDescription className="sr-only">
                        Fiche détaillée du livre {book.title}
                        {book.author ? `, de ${book.author}` : ''}. Utilisez la touche Échap pour fermer.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                        <div className="space-y-4">
                            {/* Author */}
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                <User aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5">Auteur</p>
                                    <p className="text-gray-900 dark:text-gray-100 font-medium">{book.author}</p>
                                </div>
                            </div>

                            {/* Genres */}
                            <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                                <p id="genres-du-livre" className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-2">Genres</p>
                                {/* A real ul/li instead of role="list" + role="listitem" on the
                                    buttons: role="listitem" replaced the button role outright, so
                                    the genre filters were announced as plain list items with no
                                    hint that they were operable (RGAA 11.9 / WCAG 4.1.2). */}
                                <ul className="flex flex-wrap gap-2 list-none p-0 m-0" aria-labelledby="genres-du-livre">
                                    {book.genres.map(({ genre }) => {
                                        const isSelected = selectedGenres.includes(genre.id);
                                        return (
                                            <li key={genre.id}>
                                            <button
                                                type="button"
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
                                                    : 'bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-600 dark:to-indigo-600 text-blue-900 dark:text-white hover:shadow-md hover:scale-105 cursor-pointer border border-blue-300 dark:border-blue-400/50 dark:shadow-blue-900/40'
                                                }
                                                    focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
                                                `}
                                                aria-label={isSelected ? `Genre ${genre.name} : déjà dans les filtres` : `Filtrer le catalogue par le genre ${genre.name}`}
                                                title={isSelected ? 'Déjà dans les filtres' : 'Cliquer pour ajouter aux filtres'}
                                            >
                                                {genre.name}
                                                {isSelected && <Filter aria-hidden="true" className="w-3.5 h-3.5" />}
                                            </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>

                            {/* Published Date */}
                            {book.publishedDate && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                    <Calendar aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-0.5">Date de publication</p>
                                        <p className="text-gray-900 dark:text-gray-100 font-medium">
                                            {formatCalendarDate(book.publishedDate)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Duration */}
                            {book.readingDurationMinutes && (
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 transition-all duration-300 hover:shadow-md shadow-sm">
                                    <Clock aria-hidden="true" className="w-5 h-5 text-blue-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
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
                                <h3 id="titre-description-livre" className="font-bold text-lg text-gray-900 dark:text-white">Description</h3>
                                <div aria-hidden="true" className="h-0.5 flex-1 bg-gradient-to-r from-blue-500/30 to-transparent dark:from-purple-500/30"></div>
                            </div>

                            {/* tabIndex={0}: the panel scrolls, and a scrollable region has to
                                be reachable by keyboard or its overflowing text can only be
                                read with a mouse (WCAG 2.1.1). */}
                            <div
                                className={`${
                                    isExpanded ? 'max-h-48 sm:max-h-64 lg:max-h-80' : 'max-h-24 sm:max-h-32'
                                } overflow-y-auto pr-2 custom-scrollbar transition-all duration-300 flex-1 mb-3
                                    p-4 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm`}
                                role="region"
                                tabIndex={0}
                                aria-labelledby="titre-description-livre"
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
                                            focus-visible:ring-2 focus-visible:ring-blue-500"
                                        type="button"
                                        aria-expanded={isExpanded}
                                        aria-label={isExpanded ? 'Réduire la description' : 'Afficher la description complète'}
                                    >
                                        {isExpanded ? (
                                            <>
                                                <ChevronUp aria-hidden="true" className="w-4 h-4" />
                                                Voir moins
                                            </>
                                        ) : (
                                            <>
                                                <ChevronDown aria-hidden="true" className="w-4 h-4" />
                                                Voir plus
                                            </>
                                        )}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => isSpeaking ? stopSpeaking() : speak()}
                                    className={`
                                        flex items-center justify-center gap-2 px-6 py-3
                                        text-sm sm:text-base font-semibold
                                        rounded-xl w-full
                                        transition-all duration-300
                                        shadow-lg
                                        focus-visible:ring-2 focus-visible:ring-offset-2
                                        ${isSpeaking && !isLoading
                                        ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-500/30 focus-visible:ring-red-500'
                                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-purple-600 hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-purple-700 text-white shadow-blue-500/30 dark:shadow-purple-500/30 focus-visible:ring-blue-500'
                                    }
                                        ${isLoading ? 'cursor-not-allowed opacity-80' : 'hover:shadow-xl hover:scale-[1.02]'}
                                    `}
                                    disabled={isLoading}
                                    aria-label={isSpeaking
                                        ? 'Arrêter la lecture audio de la description'
                                        : 'Écouter la brève description du livre'}
                                >
                                    {isLoading ? (
                                        <>
                                            <span aria-hidden="true" className="relative">
                                                <span className="block animate-spin rounded-full h-5 w-5 border-2 border-white/30"></span>
                                                <span className="absolute inset-0 animate-spin rounded-full h-5 w-5 border-2 border-transparent border-t-white"></span>
                                            </span>
                                            <span className="sr-only">Préparation de la lecture audio…</span>
                                        </>
                                    ) : (
                                        <>
                                            <Volume2 aria-hidden="true" className="w-5 h-5" />
                                            {isSpeaking ? 'Arrêter la lecture' : 'Brève description'}
                                        </>
                                    )}
                                </button>

                                <p role="status" aria-live="polite" className="sr-only">
                                    {speechStatus}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};