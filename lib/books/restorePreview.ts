import 'server-only';

import { prisma } from '@/lib/prisma';
import { naturalCompare } from '@/lib/audio/natural-compare';

/**
 * Ce que la restauration d'une fiche livre supprimée va rencontrer — lu par la
 * fenêtre de confirmation à son ouverture, et relu par POST
 * /api/books/[id]/restore au moment d'agir (une minute a pu passer entre les
 * deux, comme pour readBookDeletionCheck à la suppression).
 *
 * ## Pourquoi l'audio est une question, et pas un automatisme
 *
 * La restauration ramenait TOUTES les pistes que la corbeille tenait pour ce
 * livre. Or la corbeille ne garde pas que ce que la suppression y a envoyé :
 * elle garde aussi les prises ratées qu'un permanent a retirées exprès depuis
 * l'éditeur audio, parfois des semaines avant. Avec « laisser le dossier » —
 * le choix par défaut, où la suppression n'envoie rien à la corbeille — tout ce
 * que la restauration ramenait était de ce second genre : un nettoyage défait
 * sans que personne l'ait demandé.
 *
 * Les pistes sont donc proposées en deux groupes, et c'est le permanent qui
 * coche :
 *  - `withDeletion` : parties à la corbeille avec la suppression de la fiche
 *    (mode « envoyer à la corbeille »). Proposées cochées.
 *  - `earlier` : retirées avant, une par une. Proposées décochées.
 *
 * La frontière entre les deux est une fenêtre de temps avant `Book.deletedAt` :
 * la suppression copie ses pistes (jusqu'à ~45 s, voir maxDuration de la route
 * DELETE) PUIS pose deletedAt, et une suppression interrompue puis relancée
 * peut avoir déplacé une partie des pistes quelques minutes plus tôt. Cette
 * fenêtre ne décide que de la case cochée par défaut, jamais de ce qui est
 * restauré : la liste des fichiers est sous les yeux du permanent.
 *
 * Les lignes purgées (plus de copie dans le bucket) ne sont pas proposées.
 */
export const DELETION_WINDOW_MS = 15 * 60 * 1000;

export interface RestorableTrack {
    id: number;
    filename: string;
    sizeBytes: number;
    /** ISO. */
    deletedAt: string;
}

export interface BookRestorePreview {
    book: { id: number; title: string; deletedAt: string | null };
    /**
     * Le livre vivant qui porte aujourd'hui le même ISBN. L'ISBN n'est unique
     * que parmi les fiches vivantes (index partiel "Book_isbn_key") : il a pu
     * être réattribué pendant que celle-ci était supprimée, et la base refuserait
     * alors la restauration.
     */
    isbnHolder: { id: number; title: string; isbn: string } | null;
    audio: { withDeletion: RestorableTrack[]; earlier: RestorableTrack[] };
}

export async function readBookRestorePreview(bookId: number): Promise<BookRestorePreview | null> {
    // findUnique : non filtré par l'extension de suppression douce, c'est ce
    // qui rend une fiche supprimée atteignable par son identifiant.
    const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { id: true, title: true, isbn: true, deletedAt: true },
    });
    if (!book) return null;

    const isbn = book.isbn?.trim();
    const [isbnHolder, rows] = await Promise.all([
        isbn && book.deletedAt
            ? // findFirst, filtré : seules les fiches vivantes tiennent l'index.
              prisma.book.findFirst({
                  where: { isbn: book.isbn, NOT: { id: bookId } },
                  select: { id: true, title: true, isbn: true },
              })
            : null,
        book.deletedAt
            ? prisma.deletedAudioTrack.findMany({
                  where: { bookId, restoredAt: null, purgedAt: null },
                  select: { id: true, filename: true, sizeBytes: true, deletedAt: true },
                  orderBy: [{ deletedAt: 'desc' }, { filename: 'asc' }],
              })
            : [],
    ]);

    const since = book.deletedAt ? book.deletedAt.getTime() - DELETION_WINDOW_MS : Infinity;
    const withDeletion: RestorableTrack[] = [];
    const earlier: RestorableTrack[] = [];
    for (const row of rows) {
        const track: RestorableTrack = {
            id: row.id,
            filename: row.filename,
            sizeBytes: Number(row.sizeBytes),
            deletedAt: row.deletedAt.toISOString(),
        };
        (row.deletedAt.getTime() >= since ? withDeletion : earlier).push(track);
    }
    // Parties ensemble : dans l'ordre de lecture du dossier. Les plus anciennes
    // restent de la plus récente à la plus vieille, chacune avec sa date.
    withDeletion.sort((a, b) => naturalCompare(a.filename, b.filename));

    return {
        book: { id: book.id, title: book.title, deletedAt: book.deletedAt?.toISOString() ?? null },
        isbnHolder: isbnHolder && isbnHolder.isbn ? { ...isbnHolder, isbn: isbnHolder.isbn } : null,
        audio: { withDeletion, earlier },
    };
}

/** La phrase de refus, partagée par la fenêtre et la route. */
export function isbnConflictMessage(holder: { id: number; title: string; isbn: string }): string {
    return (
        `L’ISBN ${holder.isbn} est aujourd’hui porté par « ${holder.title} » (n°${holder.id}), ` +
        'et deux fiches actives ne peuvent pas partager un ISBN. C’est peut-être le même livre, ' +
        'saisi de nouveau : dans ce cas, gardez cette autre fiche. Sinon, corrigez son ISBN ' +
        'avant de restaurer celle-ci.'
    );
}
