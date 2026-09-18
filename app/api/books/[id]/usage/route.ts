import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { unexpectedErrorResponse } from '@/lib/api-errors';

/**
 * Combien de demandes et d'attributions nomment ce livre — ce que BookUsageLinks
 * affiche sur la fiche livre et sous le livre des formulaires de demande et
 * d'attribution, avec un lien vers chaque liste filtrée.
 *
 * Deux `count` de premier niveau, pas un `_count` imbriqué sur le livre : le
 * filtre soft-delete de lib/prisma.ts s'applique au premier et pas au second, et
 * une demande supprimée compterait sinon encore (même raison que
 * /api/books/[id]/audio/manage).
 */
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    if (!Number.isInteger(bookId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const [orderCount, assignmentCount] = await Promise.all([
            prisma.orders.count({ where: { catalogueId: bookId } }),
            prisma.assignment.count({ where: { catalogueId: bookId } }),
        ]);
        return NextResponse.json({ orderCount, assignmentCount });
    } catch (error) {
        return unexpectedErrorResponse({
            where: `GET /api/books/${bookId}/usage`,
            error,
            what: 'Impossible de compter les demandes et attributions de ce livre.',
            outcome: 'Rien n’a été modifié.',
        });
    }
});
