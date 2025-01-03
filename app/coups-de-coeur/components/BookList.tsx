import React from 'react';
import { groupBy } from 'lodash';
import type { Book } from '@/types/coups-de-coeur';

interface BookListProps {
    books: { book: Book }[];
    onBookClick: (book: Book) => void;
}

export const BookList: React.FC<BookListProps> = ({ books, onBookClick }) => {
    const groupBooksByGenre = (books: { book: Book }[]) => {
        const booksWithGenres = books.map(({ book }) => {
            const genreNames = book.genres?.length
                ? book.genres.map(g => g.genre?.name).filter(Boolean).sort()
                : ['Sans genre'];

            return {
                ...book,
                genreNames
            };
        });

        const grouped = groupBy(booksWithGenres, book => book.genreNames[0] || 'Sans genre');
        return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
    };

    if (!books || books.length === 0) {
        return <div className="text-gray-400 text-center py-4">Aucun livre trouvé</div>;
    }

    return (
        <div className="space-y-6">
            {groupBooksByGenre(books).map(([genre, books]) => (
                <div key={genre} className="border-t border-gray-600 pt-4">
                    <h3 className="text-xl font-semibold mb-4 text-gray-200">{genre}</h3>
                    <div className="space-y-4">
                        {books.map((book) => (
                            <div
                                key={book.id}
                                className="pl-4 cursor-pointer hover:bg-gray-600 p-2 rounded-lg transition-colors"
                                onClick={() => onBookClick(book)}
                            >
                                <div className="font-bold text-gray-100">{book.title}</div>
                                <div className="italic text-gray-400">{book.author}</div>
                                {book.description && (
                                    <p className="mt-2 text-gray-300">{book.description}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};