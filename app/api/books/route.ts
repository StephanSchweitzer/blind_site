// app/api/books/route.ts
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { BookWithGenres } from '@/types/book';
import { withAdmin } from '@/lib/auth/guards';
import { unexpectedErrorResponse } from '@/lib/api-errors';
import { findAdminBooksByIds, listAdminBooks, parseAdminBookListQuery } from '@/lib/books/bookList';

/**
 * La liste de livres du BACK-OFFICE — table des livres, sélecteur de Coup de
 * cœur, BookSearchCombobox. Admin uniquement, lecture comprise : la réponse
 * porte les livres masqués et les lignes Book complètes.
 *
 * Le catalogue public ne passe pas par ici mais par /api/catalogue, qui
 * appelle le même moteur (lib/books/bookList.ts) avec les contraintes publiques
 * fixées en dur. Cette route n'a donc plus à deviner qui demande ni pour quelle
 * page : un visiteur reçoit un 401, un permanent reçoit la vue permanent.
 *
 * `private, no-cache` sans condition : une réponse admin ne doit jamais entrer
 * dans un cache partagé (le CDN ne prend que l'URL comme clé).
 */
const ADMIN_READ_HEADERS: HeadersInit = {
    'Content-Type': 'application/json',
    'Cache-Control': 'private, no-cache',
};

export const GET = withAdmin(async (request): Promise<Response> => {
    try {
        const searchParams = request.nextUrl.searchParams;

        // Lookup by id (the Coup de cœur selector): no pagination, no counts.
        const ids = searchParams.get('ids')?.split(',').map(Number).filter(id => !isNaN(id));
        if (ids && ids.length > 0) {
            const books = await findAdminBooksByIds(ids);
            return new Response(JSON.stringify({ books }), { status: 200, headers: ADMIN_READ_HEADERS });
        }

        const response = await listAdminBooks(parseAdminBookListQuery(searchParams));
        return new Response(JSON.stringify(response), { status: 200, headers: ADMIN_READ_HEADERS });
    } catch (error) {
        console.error('Error in books API:', error);
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
});

// Type for POST request body
interface CreateBookRequest {
    title: string;
    subtitle?: string;
    author: string;
    publisher?: string;
    publishedDate: string;
    isbn?: string;
    description?: string;
    available: boolean;
    hiddenFromCatalogue?: boolean;
    readingDurationMinutes?: string;
    pageCount?: string;
    genres: number[];
}

interface CreateBookResponse {
    success: boolean;
    message: string;
    book?: BookWithGenres;
}

export const POST = withAdmin(async (req, { me }): Promise<Response> => {
    revalidateAdmin();
    let created: CreateBookResponse;
    try {
        const userId = me.id;
        const formData: CreateBookRequest = await req.json();

        if (formData.isbn?.trim()) {
            const existingBook = await prisma.book.findFirst({
                where: {
                    isbn: {
                        equals: formData.isbn,
                        mode: 'insensitive'
                    }
                }
            });

            if (existingBook) {
                const conflictResponse: CreateBookResponse = {
                    success: false,
                    message:
                        `Un livre porte déjà cet ISBN : « ${existingBook.title} » (#${existingBook.id}). ` +
                        `Vérifiez l’ISBN, ou modifiez la fiche existante. Aucun livre n’a été créé.`,
                };
                return new Response(JSON.stringify(conflictResponse), {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        }

        const newBook = await prisma.book.create({
            data: {
                title: formData.title,
                subtitle: formData.subtitle,
                author: formData.author,
                publisher: formData.publisher,
                publishedDate: new Date(formData.publishedDate),
                isbn: formData.isbn?.trim() || null,
                description: formData.description,
                available: formData.available,
                hiddenFromCatalogue: formData.hiddenFromCatalogue ?? false,
                readingDurationMinutes: formData.readingDurationMinutes ? parseInt(formData.readingDurationMinutes) : null,
                pageCount: formData.pageCount ? parseInt(formData.pageCount) : null,
                addedById: userId,
                genres: {
                    create: formData.genres.map((genreId: number) => ({
                        genre: { connect: { id: genreId } }
                    }))
                }
            },
            include: {
                genres: {
                    include: { genre: true }
                }
            }
        });

        // Hors du try : le livre existe, une panne ici ne doit pas faire croire
        // qu'il n'a pas été créé — on le recréerait en double.
        const successResponse: CreateBookResponse = {
            success: true,
            message: 'Book added successfully',
            book: newBook
        };
        created = successResponse;
    } catch (error) {
        // Renvoyait 400 avec `error.message` tel quel : le texte brut d'une
        // exception Prisma, en anglais, affiché dans le toast comme s'il
        // s'agissait d'un refus de validation. create() est l'unique écriture,
        // atomique avec ses genres : s'il a jeté, rien n'existe.
        return unexpectedErrorResponse({
            where: 'POST /api/books',
            error,
            what: 'La création du livre a échoué.',
            outcome: 'Aucun livre n’a été créé.',
        });
    }

    revalidateCatalogue();

    return new Response(JSON.stringify(created), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
    });
});