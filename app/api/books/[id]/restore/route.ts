import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { restoreTracks } from '@/lib/audio/trash';

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
 *
 * ## Restaurer ramène aussi ce que « envoyer à la corbeille » en avait détaché
 *
 * `deleteBookWithAudio` en mode `trash` ne touche jamais `audio_filepath` — la
 * fiche continue de pointer sur son dossier, désormais vidé de ses pistes,
 * parties en corbeille (voir son commentaire). Sans ceci, restaurer la fiche
 * la ramenait avec un dossier vide : il fallait ensuite se rappeler d'aller
 * les restaurer une à une depuis /admin/audio-corbeille, ou vivre avec un
 * livre « actif » sans aucun enregistrement. `restoreTracks` ne touche que les
 * lignes déjà rattachées à CE livre (`bookId`), jamais celles d'un autre —
 * une fusion ou un transfert les a réattribuées ailleurs, et ce n'est pas à
 * cette route de les leur reprendre.
 *
 * Best-effort : une piste qui ne peut pas revenir (copie de corbeille purgée,
 * emplacement d'origine réoccupé) ne bloque pas la restauration de la fiche —
 * elle reste listée dans /admin/audio-corbeille, restaurable à la main.
 */
export const maxDuration = 45; // même marge que DELETE /api/books/[id], même raison : jusqu'à ~77 pistes, copiées 10 de front.

export const POST = withAdmin(async (_request, { params, me }) => {
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

        // Après, pas avant : restoreTracks ne fait rien d'irréversible sur la
        // fiche elle-même, mais la fiche doit déjà exister « active » pour que
        // refreshBookAudioState (appelé dedans) la retrouve normalement.
        const { restored, failed } = await restoreTracks({ bookId, userId: me.id });

        let message = `« ${book.title} » a été restauré. La fiche réapparaît dans les listes et les recherches.`;
        if (restored > 0) {
            message += ` ${restored} piste${restored > 1 ? 's' : ''} audio restaurée${restored > 1 ? 's' : ''} depuis la corbeille.`;
        }
        if (failed.length > 0) {
            message +=
                ` ${failed.length} piste${failed.length > 1 ? 's' : ''} n’ont pas pu être ramenée${failed.length > 1 ? 's' : ''} ` +
                `automatiquement — voir Corbeille audio.`;
        }

        revalidateAdmin();
        revalidateCatalogue();
        return NextResponse.json({
            message,
            restoredId: bookId,
            audio: { restoredTracks: restored, failedTracks: failed.length },
        });
    } catch (error) {
        console.error('Error restoring book:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la restauration du livre' },
            { status: 500 }
        );
    }
});
