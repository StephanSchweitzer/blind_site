import { NextResponse } from 'next/server';
import { unexpectedErrorResponse } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { restoreTracksByIds } from '@/lib/audio/trash';
import { isbnConflictMessage, readBookRestorePreview } from '@/lib/books/restorePreview';

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
 * ## L'audio revient sur décision, piste par piste
 *
 * GET dit ce que la restauration va rencontrer : les pistes de ce livre encore
 * en corbeille, séparées entre celles parties AVEC la suppression et celles
 * retirées avant — voir lib/books/restorePreview.ts pour pourquoi la
 * restauration ne les ramène plus toutes d'office. POST ne ramène que les
 * `audioTrackIds` que le permanent a cochés ; sans eux, la fiche revient seule
 * et la corbeille garde tout, restaurable plus tard depuis /admin/audio-corbeille.
 *
 * Best-effort pour l'audio : une piste qui ne peut pas revenir (emplacement
 * d'origine réoccupé, copie introuvable) ne bloque pas la restauration de la
 * fiche — elle reste listée dans /admin/audio-corbeille.
 *
 * ## L'ISBN a pu être repris entre-temps
 *
 * Il n'est unique que parmi les fiches vivantes. Refus nommant la fiche qui le
 * porte, plutôt que l'erreur de contrainte de la base en 500.
 */
export const maxDuration = 45; // même marge que DELETE /api/books/[id], même raison : jusqu'à ~77 pistes, copiées 10 de front.

async function bookIdFrom(params?: Promise<Record<string, string>>): Promise<number | null> {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    return Number.isInteger(bookId) && bookId > 0 ? bookId : null;
}

/** Contrainte d'unicité, quelle que soit la couche qui l'a signalée (voir isForeignKeyViolation). */
function isUniqueViolation(error: unknown): boolean {
    const seen = new Set<unknown>();
    let node: unknown = error;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const o = node as { code?: unknown; originalCode?: unknown; cause?: unknown };
        if (o.code === 'P2002' || o.code === '23505' || o.originalCode === '23505') return true;
        node = o.cause;
    }
    return false;
}

export const GET = withAdmin(async (_request, { params }) => {
    const bookId = await bookIdFrom(params);
    if (bookId === null) {
        return NextResponse.json({ message: 'Identifiant de livre invalide' }, { status: 400 });
    }

    try {
        const preview = await readBookRestorePreview(bookId);
        if (!preview) return NextResponse.json({ message: 'Livre introuvable' }, { status: 404 });
        return NextResponse.json({
            ...preview,
            isbnConflict: preview.isbnHolder ? isbnConflictMessage(preview.isbnHolder) : null,
        });
    } catch (error) {
        return unexpectedErrorResponse({
            where: `GET /api/books/${bookId}/restore`,
            error,
            what: 'Impossible de préparer la restauration de ce livre.',
            outcome: 'Rien n’a été modifié.',
        });
    }
});

export const POST = withAdmin(async (request, { params, me }) => {
    const bookId = await bookIdFrom(params);
    if (bookId === null) {
        return NextResponse.json({ message: 'Identifiant de livre invalide' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { audioTrackIds?: unknown } | null;
    const requestedIds = Array.isArray(body?.audioTrackIds)
        ? body.audioTrackIds.filter((v): v is number => Number.isInteger(v))
        : [];

    // Posé dès que la fiche est réellement ressortie : à partir de là, une
    // exception ne doit plus se lire « la restauration a échoué ».
    let bookRestored = false;
    try {
        const preview = await readBookRestorePreview(bookId);
        if (!preview) {
            return NextResponse.json({ message: 'Livre introuvable' }, { status: 404 });
        }
        const { book } = preview;

        if (!book.deletedAt) {
            return NextResponse.json({
                message: `« ${book.title} » n’est pas supprimé : rien à restaurer.`,
                restoredId: bookId,
                alreadyActive: true,
            });
        }

        if (preview.isbnHolder) {
            return NextResponse.json(
                { message: isbnConflictMessage(preview.isbnHolder), isbnHolderId: preview.isbnHolder.id },
                { status: 409 },
            );
        }

        // Seules les pistes de CE livre, encore restaurables, peuvent être
        // demandées : un identifiant d'une autre fiche est ignoré, pas obéi.
        const restorable = new Set(
            [...preview.audio.withDeletion, ...preview.audio.earlier].map((t) => t.id),
        );
        const trashIds = [...new Set(requestedIds)].filter((id) => restorable.has(id));

        try {
            await prisma.book.update({
                where: { id: bookId },
                data: { deletedAt: null },
                select: { id: true },
            });
        } catch (error) {
            // L'ISBN a été repris entre la lecture ci-dessus et l'écriture.
            if (isUniqueViolation(error)) {
                const again = await readBookRestorePreview(bookId);
                if (again?.isbnHolder) {
                    return NextResponse.json(
                        { message: isbnConflictMessage(again.isbnHolder), isbnHolderId: again.isbnHolder.id },
                        { status: 409 },
                    );
                }
            }
            throw error;
        }
        bookRestored = true;

        // Après, pas avant : la fiche doit déjà exister « active » pour que
        // refreshBookAudioState (appelé dedans) la retrouve normalement.
        const { restored, failed } = trashIds.length
            ? await restoreTracksByIds({ trashIds, userId: me.id })
            : { restored: 0, failed: [] };

        let message = `« ${book.title} » a été restauré. La fiche réapparaît dans les listes et les recherches.`;
        if (restored > 0) {
            message += ` ${restored} piste${restored > 1 ? 's' : ''} audio restaurée${restored > 1 ? 's' : ''} depuis la corbeille.`;
        }
        if (failed.length > 0) {
            message +=
                ` ${failed.length} piste${failed.length > 1 ? 's' : ''} n’${failed.length > 1 ? 'ont' : 'a'} pas pu être ramenée${failed.length > 1 ? 's' : ''} ` +
                `(${failed[0].reason}) — voir Corbeille audio.`;
        }

        revalidateAdmin();
        revalidateCatalogue();
        return NextResponse.json({
            message,
            restoredId: bookId,
            audio: { restoredTracks: restored, failedTracks: failed.length },
        });
    } catch (error) {
        return unexpectedErrorResponse({
            where: `POST /api/books/${bookId}/restore`,
            error,
            what: bookRestored
                ? 'La fiche a bien été restaurée, mais la restauration des pistes audio s’est interrompue.'
                : 'La restauration du livre a échoué.',
            outcome: bookRestored
                ? 'Une partie des pistes a pu revenir : ouvrez l’éditeur audio et la Corbeille audio ' +
                  'pour voir ce qui reste à restaurer.'
                : 'La fiche est toujours supprimée.',
        });
    }
});
