// app/api/genres/[id]/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { withAdmin } from '@/lib/auth/guards';
import { isRecordNotFound, notFoundResponse } from '@/lib/api-errors';

export const PUT = withAdmin(async (request, { params }) => {
    revalidateAdmin();
    try {
        const body = await request.json();

        if (!body?.name) {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            );
        }

        const { id } = (await params) ?? {};
        const genreId = Number(id);
        if (!Number.isInteger(genreId)) {
            return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
        }

        const genre = await prisma.genre.update({
            where: {
                id: genreId
            },
            data: {
                name: body.name,
                description: body.description || null
            }
        });

        revalidateCatalogue();

        return NextResponse.json(
            { data: genre },
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                }
            }
        );
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Genre introuvable');
        console.error('Error updating genre:', error);
        return NextResponse.json(
            { error: 'Failed to update genre' },
            { status: 500 }
        );
    }
});

export const DELETE = withAdmin(async (_request, { params }) => {
    revalidateAdmin();
    try {
        const { id } = (await params) ?? {};
        const genreId = Number(id);
        if (!Number.isInteger(genreId)) {
            return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
        }

        // BookGenre.genre est `onDelete: Cascade` : supprimer un genre le retire
        // de TOUS les livres qui le portent, en silence et sans retour possible.
        //
        // BookGenre n'est délibérément pas audité — la justification écrite dans
        // lib/audit/config.ts est que ces lignes « only ever move with the Book /
        // CoupsDeCoeur row that owns them », ce qui ne couvre pas ce cas-ci : elles
        // bougent ici avec le GENRE. Il ne reste donc aucune trace de ce qui a été
        // décroché, et les genres du catalogue en portent jusqu'à plusieurs
        // centaines de livres chacun.
        //
        // Même garde que DELETE /api/books/[id], qui compte déjà ses demandes et
        // ses attributions avant de refuser : on annonce le nombre plutôt que de
        // détruire discrètement.
        const bookCount = await prisma.bookGenre.count({ where: { genreId } });
        if (bookCount > 0) {
            return NextResponse.json(
                {
                    error: 'Genre in use',
                    message:
                        `Ce genre est attribué à ${bookCount} livre${bookCount > 1 ? 's' : ''} et ne peut pas être supprimé : ` +
                        `il leur serait retiré à tous, sans trace ni retour en arrière. ` +
                        `Retirez-le d'abord des livres concernés.`,
                    bookCount,
                },
                { status: 409 }
            );
        }

        await prisma.genre.delete({
            where: { id: genreId },
        });

        revalidateCatalogue();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Genre introuvable');
        console.error('Error deleting genre:', error);

        return NextResponse.json(
            { error: 'Failed to delete genre' },
            { status: 500 }
        );
    }
});
