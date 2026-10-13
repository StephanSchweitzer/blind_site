// app/api/catalogue/route.ts
import { NextRequest } from 'next/server';
import { listPublicBooks, parseBookListQuery } from '@/lib/books/bookList';
import { PUBLIC_READ_CACHE_CONTROL } from '@/lib/public-read-cache';

/**
 * Recherche, filtres et pagination du catalogue PUBLIC (/catalogue).
 *
 * Volontairement ouverte, et volontairement aveugle à la session : elle ne lit
 * aucun cookie, n'accepte que ce qu'un visiteur peut demander (recherche,
 * champ, genres, page, taille), et `listPublicBooks` fixe lui-même l'exclusion
 * des livres masqués et la réduction à `PublicBook`. Il n'existe aucun
 * paramètre qui ouvrirait davantage — c'est ce qui la sépare de /api/books, la
 * vue back-office, derrière `withAdmin`.
 *
 * Même corps pour tout le monde, donc cacheable par le CDN pour tout le monde :
 * plus besoin de `private` pour les sessions ni de `Vary: Cookie`. Durées et
 * raisons : lib/public-read-cache.ts.
 */
const PUBLIC_READ_HEADERS: HeadersInit = {
    'Content-Type': 'application/json',
    'Cache-Control': PUBLIC_READ_CACHE_CONTROL,
};

export async function GET(request: NextRequest): Promise<Response> {
    try {
        const response = await listPublicBooks(parseBookListQuery(request.nextUrl.searchParams));
        return new Response(JSON.stringify(response), { status: 200, headers: PUBLIC_READ_HEADERS });
    } catch (error) {
        // Le message d'erreur reste dans les logs du serveur, pas dans la
        // réponse : renvoyer `error.message` recopiait l'erreur de validation
        // Prisma telle quelle au public (chemins absolus du serveur, extrait de
        // la requête compilée).
        console.error('Error in catalogue API:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: 'Erreur lors de la récupération des livres',
            books: [],
            total: 0,
            page: 1,
            totalPages: 0,
            availableCount: 0,
            unavailableCount: 0,
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
