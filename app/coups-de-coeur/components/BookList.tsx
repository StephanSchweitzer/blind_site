import React from 'react';
import { groupBy } from 'lodash';
import type { Book } from '@/types/coups-de-coeur';

interface BookListProps {
    books: { book: Book }[];
    onBookClick: (book: Book) => void;
}

// Simple truncated description
const TruncatedDescription: React.FC<{ description: string, characterLimit?: number }> = ({
                                                                                              description,
                                                                                              characterLimit = 200
                                                                                          }) => {
    if (description.length <= characterLimit) {
        return <>{description}</>;
    }

    return (
        <>{description.substring(0, characterLimit)}... <span className="text-blue-400 dark:text-purple-400 font-medium hover:underline">Cliquer pour tout afficher</span></>
    );
};

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
        return (
            <div className="text-center py-8 px-4 rounded-xl bg-gray-100/50 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30">
                <p className="text-gray-600 dark:text-gray-400 font-medium">Aucun livre trouvé</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {groupBooksByGenre(books).map(([genre, books], genreIndex) => (
                <div
                    key={genre}
                    className="border-t-2 border-gray-300/50 dark:border-gray-600/50 pt-6 animate-fade-in"
                    style={{ animationDelay: `${genreIndex * 100}ms` }}
                >
                    <div className="flex items-center gap-3 mb-5">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{genre}</h3>
                        <div className="h-0.5 flex-1 bg-gradient-to-r from-blue-500/30 to-transparent dark:from-purple-500/30"></div>
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            {books.length} {books.length === 1 ? 'livre' : 'livres'}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {books.map((book, index) => (
                            <div
                                key={book.id}
                                style={{ animationDelay: `${(genreIndex * 100) + (index * 50)}ms` }}
                                className="group pl-4 cursor-pointer
                                    p-4 rounded-xl
                                    bg-white/90 dark:bg-gray-800/90
                                    backdrop-blur-xl backdrop-saturate-150
                                    border border-gray-200/50 dark:border-gray-600/60
                                    shadow-md dark:shadow-[0_4px_20px_rgb(0,0,0,0.4)]
                                    hover:shadow-lg hover:shadow-blue-500/10 dark:hover:shadow-purple-500/20
                                    hover:-translate-y-1 hover:scale-[1.01]
                                    hover:border-blue-300/50 dark:hover:border-purple-400/70
                                    transition-all duration-300 ease-out
                                    relative overflow-hidden
                                    animate-fade-in-up"
                                onClick={() => onBookClick(book)}
                            >
                                {/* Subtle shine effect */}
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
                                </div>

                                <div className="relative z-10">
                                    <div className="font-bold text-lg text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-purple-400 transition-colors duration-300">
                                        {book.title}
                                    </div>
                                    <div className="italic text-gray-700 dark:text-gray-300 mb-2 text-sm">
                                        {book.author}
                                    </div>
                                    {book.description && (
                                        <p className="mt-3 text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
                                            <TruncatedDescription description={book.description} />
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};