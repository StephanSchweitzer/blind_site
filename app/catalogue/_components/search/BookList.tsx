import React from 'react';
import { Book as BookType } from '@prisma/client';

interface BookWithGenres extends BookType {
    genres: {
        genre: {
            id: number;
            name: string;
        };
    }[];
}

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
                    className="bg-white border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow"
                >
                    <h3 className="text-lg font-semibold text-gray-900">{book.title}</h3>
                    <p className="text-gray-600">{book.author}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {book.genres.map(({ genre }) => (
                            <span
                                key={genre.id}
                                className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full"
                            >
                                {genre.name}
                            </span>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                        {formatDuration(book.readingDurationMinutes)}
                    </p>
                    <div className="mt-2">
                        <span className={`px-2 py-1 rounded-full text-sm ${
                            book.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                            {book.available ? 'Disponible' : 'Indisponible'}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
};