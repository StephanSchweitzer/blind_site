import type { BookWithGenres } from '@/types/book';
import { prisma } from '@/lib/prisma';
import { STATUS } from '@/lib/statusSync';

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
    /**
     * Pas encore disponible, mais une attribution « En cours » le tient : un
     * lecteur l'enregistre. Sert au badge du catalogue (« Enregistrement en
     * cours » / « En attente d'enregistrement »). Volontairement un booléen et rien
     * de plus : ni date d'envoi, ni échéance, ni lecteur ne sortent vers le
     * public — une date affichée ferait d'un bénévole lent un retard visible.
     */
    recordingInProgress: boolean;
    genres: {
        bookId: number;
        genreId: number;
        genre: { id: number; name: string; description: string | null };
    }[];
}

/**
 * Parmi ces livres, ceux qu'un lecteur enregistre en ce moment — une requête pour
 * toute la page. Un livre déjà disponible n'est jamais compté : une relecture ne
 * doit pas le faire passer pour indisponible.
 *
 * Tout ce qui change une attribution (création, statut, livre, suppression) doit
 * donc appeler revalidateCatalogue(), sans quoi le badge reste figé en cache.
 */
export async function findBooksBeingRecorded(
    books: Pick<BookWithGenres, 'id' | 'available'>[],
): Promise<ReadonlySet<number>> {
    const ids = books.filter((b) => !b.available).map((b) => b.id);
    if (ids.length === 0) return new Set();
    const rows = await prisma.assignment.findMany({
        where: { catalogueId: { in: ids }, statusId: STATUS.EN_COURS, deletedAt: null },
        select: { catalogueId: true },
        distinct: ['catalogueId'],
    });
    return new Set(rows.map((r) => r.catalogueId));
}

export function toPublicBook(book: BookWithGenres, beingRecorded: ReadonlySet<number>): PublicBook {
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
        recordingInProgress: !book.available && beingRecorded.has(book.id),
        genres: book.genres.map(({ bookId, genreId, genre }) => ({
            bookId,
            genreId,
            genre: { id: genre.id, name: genre.name, description: genre.description },
        })),
    };
}
