'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PublicBook } from '@/lib/books/publicBook';
import { sectionSpine } from '@/lib/books/genreFamily';
import { groupListByGenre } from '@/lib/books/listGenres';

interface BookListProps {
    books: { book: PublicBook; note?: string | null; position?: number | null }[];
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

    // Cut at the last whole word: a hard cut at 200 left « 1940 au m… ».
    // A word longer than the whole limit (a URL) keeps the hard cut.
    const cut = description.substring(0, characterLimit + 1);
    const lastSpace = cut.lastIndexOf(' ');
    const excerpt = (lastSpace > characterLimit / 2 ? cut.substring(0, lastSpace) : cut.substring(0, characterLimit))
        .replace(/[\s,;:.!?«(\-–—]+$/, '');

    return (
        // aria-hidden: the affordance is already carried by the title button's
        // own name, and "Cliquer pour…" reads as an instruction to click, which
        // is meaningless for a keyboard or screen-reader user (RGAA 13.10).
        <>{excerpt}… <span aria-hidden="true" className="text-blue-700 dark:text-blue-300 font-medium hover:underline">Cliquer pour tout afficher</span></>
    );
};

/** Below this many genres, the sections are short enough to read straight through. */
const GENRE_SHORTCUTS_FROM = 3;

/** Jump to a genre's heading and put focus there, so reading continues from it. */
const goToGenre = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const heading = document.getElementById(id);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
};

/**
 * The genre shortcuts, as an index: name on the left, count on the right,
 * flowing down in columns so the order reads top to bottom. They were pills
 * wrapped in a cloud, each as wide as its name — seventeen genres made a
 * ragged block of half-filled lines, and on a phone 550 px of it before the
 * first book.
 *
 * Columns are sized in rem, so the site's larger text settings drop to fewer
 * columns instead of squeezing the names. The index is folded behind one
 * button, on every screen: it is a shortcut, not content — readers come for the
 * books — and neither a screen-reader swipe nor a Tab key goes through
 * seventeen links to reach the first one. « Toutes les listes », just above,
 * is folded the same way.
 */
const GenreShortcuts: React.FC<{ genres: [string, number][] }> = ({ genres }) => {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const label = 'Genres de cette liste';

    return (
        <nav aria-label={label} className="rounded-xl border border-border bg-gray-100/60 dark:bg-gray-700/20 px-2 py-2 sm:px-3 sm:py-3">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span>
                    {label} <span className="font-normal text-gray-700 dark:text-gray-300">({genres.length})</span>
                </span>
                <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <ul
                id={listId}
                // One column on a phone: two there left ~136 px each, and most
                // names broke over two or three lines.
                className={`${open ? 'block' : 'hidden'} mt-1 list-none p-0 sm:columns-[12rem] sm:gap-x-4`}
            >
                {genres.map(([genre, count], genreIndex) => (
                    <li key={genre} className="break-inside-avoid">
                        <a
                            href={`#genre-${genreIndex}`}
                            onClick={(event) => goToGenre(event, `genre-${genreIndex}`)}
                            className="flex items-baseline gap-2 rounded-md px-2 py-1 text-sm leading-snug text-foreground transition-colors hover:bg-primary/10 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span aria-hidden="true" className={`block h-3 w-1 shrink-0 translate-y-0.5 rounded-[1px] ${sectionSpine(genreIndex)}`} />
                            <span className="min-w-0 flex-1 break-words">{genre}</span>
                            <span aria-hidden="true" className="shrink-0 tabular-nums text-gray-700 dark:text-gray-300">{count}</span>
                            <span className="sr-only">, {count} {count === 1 ? 'livre' : 'livres'}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export const BookList: React.FC<BookListProps> = ({ books, onBookClick }) => {
    if (!books || books.length === 0) {
        return (
            <div className="text-center py-8 px-4 rounded-xl bg-gray-100/50 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30">
                <p className="text-gray-700 dark:text-gray-300 font-medium">Aucun livre trouvé</p>
            </div>
        );
    }

    // Grouped as entries, the note beside the book rather than spread into it:
    // the book alone goes to the fiche (onBookClick), which never shows the note.
    const groups = groupListByGenre(books);

    return (
        <div className="space-y-8">
            {/* Shortcuts to each genre: a list of thirty books is otherwise read,
                or tabbed through, from the top to reach the one genre wanted. */}
            {groups.length >= GENRE_SHORTCUTS_FROM && (
                <GenreShortcuts genres={groups.map(([genre, entries]) => [genre, entries.length])} />
            )}
            {groups.map(([genre, books], genreIndex) => (
                <section
                    key={genre}
                    aria-labelledby={`genre-${genreIndex}`}
                    className="border-t-2 border-gray-300/50 dark:border-gray-600/50 pt-6"
                    style={{ animationDelay: `${genreIndex * 100}ms` }}
                >
                    <div className="flex items-center gap-3 mb-5">
                        {/* The section's spine (lib/books/genreFamily.ts, SECTION_SPINES), next to
                            the genre's written name. */}
                        <span aria-hidden="true" className={`block h-7 w-2 shrink-0 rounded-[2px] ${sectionSpine(genreIndex)}`} />
                        {/* tabIndex -1: the genre shortcuts above put focus here. */}
                        <h3 id={`genre-${genreIndex}`} tabIndex={-1} className="scroll-mt-28 text-xl font-bold text-foreground outline-none">{genre}</h3>
                        <div aria-hidden="true" className="h-0.5 flex-1 bg-border"></div>
                        {/* nowrap: on a phone a long genre name squeezed it onto two lines. */}
                        <span className="shrink-0 whitespace-nowrap text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            {books.length} {books.length === 1 ? 'livre' : 'livres'}
                        </span>
                    </div>
                    {/* Each entry was a `div` with an onClick: the only way to open a
                        book's details on this page was a mouse click. The title is now
                        a real button, and the card keeps its click target on top. */}
                    <ul className="space-y-3 list-none p-0">
                        {books.map(({ book, note }, index) => (
                            <li key={book.id}>
                            <article
                                style={{ animationDelay: `${(genreIndex * 100) + (index * 50)}ms` }}
                                // A 2 px lift on hover, as in the catalogue: this opens.
                                // The spine repeats the section's.
                                className="group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card py-4 pl-6 pr-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-within:border-primary"
                                onClick={() => onBookClick(book)}
                            >
                                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${sectionSpine(genreIndex)}`} />

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
                                        {/* Déjà dans le nom du bouton (« , de … ») : lu une seule fois. */}
                                        <div aria-hidden="true" className="italic text-gray-700 dark:text-gray-300 text-sm">
                                            {book.author}
                                        </div>
                                    </div>
                                    {(book.description || note) && (
                                        <div className="p-3 rounded-xl bg-gray-100 dark:bg-gray-700/30 border border-gray-300 dark:border-gray-600/30 shadow-sm">
                                            {book.description && (
                                                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
                                                    <TruncatedDescription description={book.description} />
                                                </p>
                                            )}
                                            {/* La note de la liste, en italique après la présentation.
                                                L'italique ne s'entend pas : le lecteur d'écran l'annonce. */}
                                            {note && (
                                                <p className={`italic text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed${book.description ? ' mt-2' : ''}`}>
                                                    <span className="sr-only">Note : </span>{note}
                                                </p>
                                            )}
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
