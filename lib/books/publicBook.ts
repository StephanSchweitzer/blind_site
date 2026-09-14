import type { BookWithGenres } from '@/types/book';

/**
 * The book fields a visitor to the public site has any use for.
 *
 * Everything else on `Book` is back-office bookkeeping a signed-out request
 * has no business receiving: `audio_filepath` is the literal object-storage
 * key (bucket layout), `source_access_id`/`id_arbre`/`needsReview` are
 * Access-import/duplicate-review provenance, `polly_audio_url`/
 * `audioLinkStatus`/`audioCheckedAt`/`audioTrackCount`/`audioSizeKb`/
 * `escalatedAt` are audio-pipeline state, `stock_date`/`last_downloaded_date`/
 * `addedById`/`createdAt`/`updatedAt` are internal timestamps, and
 * `hiddenFromCatalogue` is meaningless once the row has already been filtered
 * to `false`. None of it is rendered anywhere on /catalogue or
 * /listes-de-livres — it was only ever present because the routes selected
 * whole Prisma rows.
 */
export interface PublicBook {
    id: number;
    title: string;
    subtitle: string | null;
    author: string;
    publisher: string | null;
    pageCount: number | null;
    description: string | null;
    publishedDate: Date | null;
    readingDurationMinutes: number | null;
    available: boolean;
    genres: {
        bookId: number;
        genreId: number;
        genre: { id: number; name: string; description: string | null };
    }[];
}

export function toPublicBook(book: BookWithGenres): PublicBook {
    return {
        id: book.id,
        title: book.title,
        subtitle: book.subtitle,
        author: book.author,
        publisher: book.publisher,
        pageCount: book.pageCount,
        description: book.description,
        publishedDate: book.publishedDate,
        readingDurationMinutes: book.readingDurationMinutes,
        available: book.available,
        genres: book.genres.map(({ bookId, genreId, genre }) => ({
            bookId,
            genreId,
            genre: { id: genre.id, name: genre.name, description: genre.description },
        })),
    };
}
