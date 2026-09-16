import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';

/**
 * Undo a soft deletion — the counterpart of DELETE /api/books/[id].
 *
 * WHY THIS EXISTS SEPARATELY FROM THE JOURNAL'S « Restaurer »
 *
 * The audit trail's restore recreates a row from a snapshot, and is a
 * last-resort tool: it inherits the journal's 14-day retention and its size
 * limits. None of that applies here. A soft-deleted book was never destroyed —
 * the row, its `audio_filepath` and its ISBN are all intact, `deletedAt`
 * merely hides it from every list read (see the extension in lib/prisma.ts) —
 * so undoing it is one column write and works forever rather than for a
 * fortnight. See lib/books/deletionGuard.ts and deleteBookWithAudio.ts for why
 * a book soft-deletes at all.
 *
 * Undo belongs to the domain model. The journal only records that it
 * happened, which the audit extension does on its own for this update.
 */
export const POST = withAdmin(async (_request, { params }) => {
    const { id } = await params!;
    const bookId = parseInt(id, 10);
    if (Number.isNaN(bookId)) {
        return NextResponse.json({ message: 'Identifiant de livre invalide' }, { status: 400 });
    }

    try {
        // findUnique is deliberately NOT soft-delete-filtered, which is the whole
        // reason a deleted book is still reachable by id — and why this can
        // answer idempotently instead of 404-ing on the row it is meant to fix.
        const book = await prisma.book.findUnique({
            where: { id: bookId },
            select: { id: true, title: true, deletedAt: true },
        });

        if (!book) {
            return NextResponse.json({ message: 'Livre introuvable' }, { status: 404 });
        }

        if (!book.deletedAt) {
            return NextResponse.json({
                message: `« ${book.title} » n’est pas supprimé : rien à restaurer.`,
                restoredId: bookId,
                alreadyActive: true,
            });
        }

        await prisma.book.update({
            where: { id: bookId },
            data: { deletedAt: null },
            select: { id: true },
        });

        revalidateAdmin();
        revalidateCatalogue();
        return NextResponse.json({
            message: `« ${book.title} » a été restauré. La fiche réapparaît dans les listes et les recherches.`,
            restoredId: bookId,
        });
    } catch (error) {
        console.error('Error restoring book:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la restauration du livre' },
            { status: 500 }
        );
    }
});
