import React from 'react';
import { groupBy } from 'lodash';
import type { PublicBook } from '@/lib/books/publicBook';
import { genreFamily, GENRE_FAMILY_SPINE } from '@/lib/books/genreFamily';

interface BookListProps {
    books: { book: PublicBook }[];
    onBookClick: (book: PublicBook) => void;
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
        // aria-hidden: the affordance is already carried by the title button's
        // own name, and "Cliquer pour…" reads as an instruction to click, which
        // is meaningless for a keyboard or screen-reader user (RGAA 13.10).
        <>{description.substring(0, characterLimit)}… <span aria-hidden="true" className="text-blue-700 dark:text-blue-300 font-medium hover:underline">Cliquer pour tout afficher</span></>
    );
};

export const BookList: React.FC<BookListProps> = ({ books, onBookClick }) => {
    const groupBooksByGenre = (books: { book: PublicBook }[]) => {
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
                <p className="text-gray-700 dark:text-gray-300 font-medium">Aucun livre trouvé</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {groupBooksByGenre(books).map(([genre, books], genreIndex) => (
                <section
                    key={genre}
                    aria-labelledby={`genre-${genreIndex}`}
                    className="border-t-2 border-gray-300/50 dark:border-gray-600/50 pt-6"
                    style={{ animationDelay: `${genreIndex * 100}ms` }}
                >
                    <div className="flex items-center gap-3 mb-5">
                        {/* The genre family's spine (lib/books/genreFamily.ts), next to
                            the genre's written name. */}
                        <span aria-hidden="true" className={`block h-7 w-2 shrink-0 rounded-[2px] ${GENRE_FAMILY_SPINE[genreFamily(genre)]}`} />
                        <h3 id={`genre-${genreIndex}`} className="text-xl font-bold text-foreground">{genre}</h3>
                        <div aria-hidden="true" className="h-0.5 flex-1 bg-border"></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            {books.length} {books.length === 1 ? 'livre' : 'livres'}
                        </span>
                    </div>
                    {/* Each entry was a `div` with an onClick: the only way to open a
                        book's details on this page was a mouse click. The title is now
                        a real button, and the card keeps its click target on top. */}
                    <ul className="space-y-3 list-none p-0">
                        {books.map((book, index) => (
                            <li key={book.id}>
                            <article
                                style={{ animationDelay: `${(genreIndex * 100) + (index * 50)}ms` }}
                                // No lift on hover (it moved under the pointer); the border
                                // says « this opens ». The spine repeats the section's.
                                className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card py-4 pl-6 pr-4 shadow-sm transition-colors hover:border-primary hover:shadow-md focus-within:border-primary"
                                onClick={() => onBookClick(book)}
                            >
                                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${GENRE_FAMILY_SPINE[genreFamily(genre)]}`} />

                                <div className="relative z-10">
                                    <div className="mb-3">
                                        <h4 className="font-bold text-lg text-foreground mb-1 group-hover:text-primary dark:group-hover:text-blue-300">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    // The card wrapper opens the modal too; without this
                                                    // the handler fires twice for one activation.
                                                    event.stopPropagation();
                                                    onBookClick(book);
                                                }}
                                                className="text-left w-full rounded-sm after:absolute after:inset-0 after:content-['']"
                                            >
                                                {book.title}
                                                <span className="sr-only">, de {book.author} — voir la fiche détaillée</span>
                                            </button>
                                        </h4>
                                        <div className="italic text-gray-700 dark:text-gray-300 text-sm">
                                            {book.author}
                                        </div>
                                    </div>
                                    {book.description && (
                                        <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                                            <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
                                                <TruncatedDescription description={book.description} />
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </article>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
};
