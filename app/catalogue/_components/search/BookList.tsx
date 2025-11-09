import React from 'react';
import { BookWithGenres } from '@/types/book';

interface BookListProps {
    books: BookWithGenres[];
    onBookClick: (book: BookWithGenres) => void;
}

const formatDuration = (minutes: number | null): string => {
    if (!minutes) return 'Durée non spécifiée';

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
        return remainingMinutes === 1
            ? `${remainingMinutes} minute d'écoute`
            : `${remainingMinutes} minutes d'écoute`;
    }

    if (remainingMinutes === 0) {
        return hours === 1
            ? `${hours} heure d'écoute`
            : `${hours} heures d'écoute`;
    }

    const hourText = hours === 1 ? 'heure' : 'heures';
    const minuteText = remainingMinutes === 1 ? 'minute' : 'minutes';
    return `${hours} ${hourText} ${remainingMinutes} ${minuteText} d'écoute`;
};

export const BookList: React.FC<BookListProps> = ({ books, onBookClick }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {books.map((book, index) => (
                <div
                    key={book.id}
                    onClick={() => onBookClick(book)}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className="group p-5 rounded-2xl cursor-pointer transition-all duration-500 ease-out
                        bg-white/90 dark:bg-gray-800/95
                        backdrop-blur-xl backdrop-saturate-150
                        border border-gray-200/50 dark:border-gray-600/60
                        shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_12px_40px_rgb(0,0,0,0.5)]
                        hover:shadow-[0_20px_60px_rgb(59,130,246,0.15)] dark:hover:shadow-[0_25px_70px_rgb(147,51,234,0.4)]
                        hover:-translate-y-2 hover:scale-[1.02]
                        hover:border-blue-300/50 dark:hover:border-purple-400/70
                        animate-fade-in-up
                        relative overflow-hidden
                        before:absolute before:inset-0 before:rounded-2xl before:opacity-0 before:transition-opacity before:duration-500
                        before:bg-gradient-to-br before:from-blue-500/5 before:to-purple-500/5
                        hover:before:opacity-100"
                >
                    {/* Shine effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                    </div>

                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors duration-300">
                            {book.title}
                        </h3>
                        <p className="text-gray-700 dark:text-gray-200 mb-3 line-clamp-1 text-sm">
                            {book.author}
                        </p>

                        {book.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {book.genres.slice(0, 3).map(({ genre }) => (
                                    <span
                                        key={genre.id}
                                        className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-indigo-900/30 dark:to-purple-900/30
                                            text-blue-700 dark:text-indigo-300
                                            text-xs font-medium px-2.5 py-1 rounded-full
                                            border border-blue-200/50 dark:border-indigo-700/50
                                            shadow-sm
                                            transition-all duration-300
                                            group-hover:shadow-md group-hover:scale-105"
                                    >
                                        {genre.name}
                                    </span>
                                ))}
                                {book.genres.length > 3 && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
                                        +{book.genres.length - 3}
                                    </span>
                                )}
                            </div>
                        )}

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatDuration(book.readingDurationMinutes)}
                        </p>

                        <div className="flex items-center justify-between">
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold
                                shadow-md
                                transition-all duration-300
                                ${book.available
                                ? 'bg-gradient-to-r from-emerald-400 to-green-500 dark:from-emerald-600 dark:to-green-700 text-white border border-emerald-500/50 dark:border-emerald-600/50 shadow-emerald-500/30 dark:shadow-emerald-700/30'
                                : 'bg-gradient-to-r from-amber-400 to-orange-500 dark:from-amber-600 dark:to-orange-700 text-white border border-amber-500/50 dark:border-amber-600/50 shadow-amber-500/30 dark:shadow-amber-700/30 animate-pulse-subtle'
                            }`}>
                                {book.available ? '✓ Disponible' : '⏳ En attente'}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};