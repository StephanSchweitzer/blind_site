// app/api/catalogue/[id]/route.ts
import { findPublicBook } from '@/lib/books/bookList';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/public-read-cache';

/**
 * Une fiche du catalogue PUBLIC, pour le lien partagé `/catalogue?livre=<id>` :
 * le livre peut ne pas figurer sur la page de résultats affichée.
 *
 * Ouverte comme /api/catalogue, et pour la même raison : elle ne lit aucune
 * session et `findPublicBook` fixe lui-même ce qu'un visiteur peut voir —
 * un livre masqué ou supprimé répond 404, comme un id qui n'existe pas.
 *
 * Seul le succès est cacheable (lib/public-read-cache.ts) : un 404 tenu par le
 * CDN survivrait à la réapparition du livre.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
    const { id } = await params;
    const bookId = Number(id);
    if (!Number.isSafeInteger(bookId) || bookId <= 0) {
        return Response.json({ error: 'Livre introuvable' }, { status: 404 });
    }

    try {
        const book = await findPublicBook(bookId);
        if (!book) {
            return Response.json({ error: 'Livre introuvable' }, { status: 404 });
        }
        return Response.json(book, { headers: { 'Cache-Control': PUBLIC_READ_CACHE_CONTROL } });
    } catch (error) {
        // Le message reste dans les logs : voir /api/catalogue.
        console.error('Error in catalogue book API:', error);
        return Response.json({ error: 'Erreur lors de la récupération du livre' }, { status: 500 });
    }
}
