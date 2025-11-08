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
            {books.map((book) => (
                <div
                    key={book.id}
                    onClick={() => onBookClick(book)}
                    className="p-4 rounded-xl cursor-pointer hover:scale-[1.02] transition-all duration-300 bg-gray-800 dark:bg-white border border-gray-700 dark:border-gray-300 shadow-xl"
                >
                    <h3 className="text-lg font-semibold text-white dark:text-gray-900">{book.title}</h3>
                    <p className="text-gray-200 dark:text-gray-700">{book.author}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {book.genres.map(({ genre }) => (
                            <span
                                key={genre.id}
                                className="bg-indigo-200 dark:bg-indigo-700 text-indigo-900 dark:text-indigo-100 text-xs px-2 py-0.5 rounded-full border border-indigo-300 dark:border-indigo-600"
                            >
                                {genre.name}
                            </span>
                        ))}
                    </div>
                    <p className="text-sm text-gray-400 dark:text-gray-600 mt-2">
                        {formatDuration(book.readingDurationMinutes)}
                    </p>
                    <div className="mt-2">
                        <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                            book.available
                                ? 'bg-emerald-200 dark:bg-emerald-700 text-emerald-900 dark:text-emerald-100 border border-emerald-300 dark:border-emerald-600'
                                : 'bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 border border-amber-300 dark:border-amber-600'
                        }`}>
                            {book.available ? 'Disponible' : 'En attente de lecture'}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};