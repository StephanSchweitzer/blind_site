import React from 'react';
import type { PublicBook } from '@/lib/books/publicBook';
import { genreFamily, GENRE_FAMILY_SPINE } from '@/lib/books/genreFamily';

interface BookListProps {
    books: PublicBook[];
    onBookClick: (book: PublicBook) => void;
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
        // The cards used to be bare `div`s with an onClick: the whole catalogue
        // was unreachable without a mouse. Each card is now an <article> whose
        // title is a real button — that is the keyboard and screen-reader entry
        // point — while the card itself keeps its click target for mouse users.
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6 list-none p-0">
            {books.map((book) => {
                // The spine: the colour of the first genre's family
                // (lib/books/genreFamily.ts). The genre itself is written on
                // the card just below — the colour only helps the eye group
                // neighbours, it never says anything alone.
                const spine = GENRE_FAMILY_SPINE[genreFamily(book.genres[0]?.genre.name)];
                return (
                <li key={book.id}>
                <article
                    onClick={() => onBookClick(book)}
                    // No lift, no zoom, no sweeping shine on hover: a card that
                    // moves under the pointer is hard to follow at high zoom. The
                    // border and a shadow say « this opens » instead.
                    className="group relative h-full cursor-pointer overflow-hidden rounded-xl border border-border bg-card py-5 pl-7 pr-5 shadow-sm transition-colors hover:border-primary hover:shadow-md focus-within:border-primary"
                >
                    <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-2 ${spine}`} />

                    <div className="relative">
                        <h3 className="text-lg font-bold text-foreground mb-1 line-clamp-2 group-hover:text-primary dark:group-hover:text-blue-300">
                            <button
                                type="button"
                                onClick={(event) => {
                                    // The card wrapper also opens the modal; without this the
                                    // handler would fire twice for one activation.
                                    event.stopPropagation();
                                    onBookClick(book);
                                }}
                                className="text-left w-full rounded-sm after:absolute after:inset-0 after:content-['']"
                            >
                                {book.title}
                                {/* The author, duration and availability are already read
                                    from the card body just below; the name only has to make
                                    the button unambiguous in a list of links (RGAA 6.1). */}
                                <span className="sr-only">, de {book.author} — voir la fiche détaillée</span>
                            </button>
                        </h3>
                        <p className="text-muted-foreground mb-3 line-clamp-1 text-sm">
                            {book.author}
                        </p>

                        {book.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {book.genres.slice(0, 3).map(({ genre }) => (
                                    <span
                                        key={genre.id}
                                        className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                                    >
                                        {genre.name}
                                    </span>
                                ))}
                                {book.genres.length > 3 && (
                                    <span className="text-xs text-muted-foreground px-2 py-1">
                                        <span aria-hidden="true">+{book.genres.length - 3}</span>
                                        <span className="sr-only">et {book.genres.length - 3} autres genres</span>
                                    </span>
                                )}
                            </div>
                        )}

                        <p className="text-sm text-muted-foreground mb-3 flex items-center gap-1.5">
                            <svg aria-hidden="true" focusable="false" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatDuration(book.readingDurationMinutes)}
                        </p>

                        <div className="flex items-center justify-between">
                            {/* Contrast: white on the old emerald-400→green-500 and
                                amber-400→orange-500 gradients measured 1.7–2.8:1 against
                                a 4.5:1 requirement for 12px text — the status was
                                effectively unreadable for a low-vision user. The 700
                                shades keep the same colour language at 5:1+ in both
                                themes, now as flat fills. « En attente » no longer
                                pulses: a badge that breathes is motion for its own sake.
                                The ✓ / ⏳ glyphs are decoration: read aloud they become
                                "coche" / "sablier" and clutter the status. */}
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold text-white ${
                                book.available ? 'bg-emerald-700' : 'bg-amber-700'
                            }`}>
                                <span aria-hidden="true">{book.available ? '✓' : '⏳'}</span>{' '}
                                {book.available ? 'Disponible' : 'En attente'}
                            </span>
                        </div>
                    </div>
                </article>
                </li>
                );
            })}
        </ul>
    );
};
