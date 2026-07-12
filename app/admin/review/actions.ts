'use server';

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

async function requireAdmin() {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) return null;
    return me;
}

// Scalars the permanent may choose to pull from the removed book onto the survivor.
// audio_filepath is deliberately NOT here — it's auto-handled (always kept; a genuine
// two-recording conflict blocks the whole merge). source_access_id/id_arbre are identity.
const OVERRIDABLE_FIELDS = [
    'title',
    'author',
    'subtitle',
    'publishedDate',
    'isbn',
    'publisher',
    'pageCount',
    'readingDurationMinutes',
    'description',
] as const;

const OVERRIDABLE = new Set<string>(OVERRIDABLE_FIELDS);

/**
 * FUSE: merge the removed book into the survivor, in a single transaction.
 * `overrides` lists the fields whose value should be taken FROM the removed book
 * (everything else keeps the survivor's value). Reassigns relations, applies the
 * chosen fields, always preserves an audio path, deletes the removed book, clears
 * the review flag, and appends an immutable BookMergeEvent with a snapshot.
 */
export async function fuseBooks(
    survivorId: number,
    removedId: number,
    overrides: string[] = []
): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(survivorId) || !Number.isInteger(removedId)) {
        return { ok: false, message: 'Identifiants invalides' };
    }
    if (survivorId === removedId) {
        return { ok: false, message: 'Un livre ne peut pas être fusionné avec lui-même' };
    }

    const fields = [...new Set(overrides)].filter((f) => OVERRIDABLE.has(f));

    try {
        await prisma.$transaction(async (tx) => {
            const survivor = await tx.book.findUnique({ where: { id: survivorId } });
            const removed = await tx.book.findUnique({ where: { id: removedId } });
            if (!survivor) throw new Error('SURVIVOR_NOT_FOUND');
            if (!removed) throw new Error('REMOVED_NOT_FOUND');

            // Double-audio guard: never delete a distinct recording. If both sides carry a
            // different audio path, the merge is blocked pending manual review.
            const sAudio = survivor.audio_filepath?.trim() || null;
            const rAudio = removed.audio_filepath?.trim() || null;
            if (sAudio && rAudio && sAudio !== rAudio) throw new Error('AUDIO_CONFLICT');

            // 1. Reassign relations off the removed book onto the survivor.
            //    Assignment/Orders reference the book via `catalogueId` (no unique constraint).
            await tx.assignment.updateMany({ where: { catalogueId: removedId }, data: { catalogueId: survivorId } });
            await tx.orders.updateMany({ where: { catalogueId: removedId }, data: { catalogueId: survivorId } });

            // BookGenre PK is (bookId, genreId): drop removed rows the survivor already has, move the rest.
            const keepGenres = await tx.bookGenre.findMany({ where: { bookId: survivorId }, select: { genreId: true } });
            await tx.bookGenre.deleteMany({
                where: { bookId: removedId, genreId: { in: keepGenres.map((g) => g.genreId) } },
            });
            await tx.bookGenre.updateMany({ where: { bookId: removedId }, data: { bookId: survivorId } });

            // CoupsDeCoeurBooks PK is (coupsDeCoeurId, bookId): same de-dup then move.
            const keepLists = await tx.coupsDeCoeurBooks.findMany({ where: { bookId: survivorId }, select: { coupsDeCoeurId: true } });
            await tx.coupsDeCoeurBooks.deleteMany({
                where: { bookId: removedId, coupsDeCoeurId: { in: keepLists.map((c) => c.coupsDeCoeurId) } },
            });
            await tx.coupsDeCoeurBooks.updateMany({ where: { bookId: removedId }, data: { bookId: survivorId } });

            // 2. Snapshot + delete the removed book BEFORE writing scalars onto the survivor,
            //    so pulling the removed book's @unique isbn can't collide with the still-live row.
            const snapshot = {
                removedBook: JSON.parse(JSON.stringify(removed)),
                overrides: fields,
            } as unknown as Prisma.InputJsonValue;
            await tx.book.delete({ where: { id: removedId } });

            // 3. Apply the chosen field overrides onto the survivor, always keep an audio
            //    path (take the removed one if the survivor had none), clear the review flag.
            const data: Prisma.BookUpdateInput = { needsReview: false, id_arbre: null };
            for (const f of fields) {
                (data as Record<string, unknown>)[f] = (removed as Record<string, unknown>)[f];
            }
            if (!sAudio && rAudio) data.audio_filepath = removed.audio_filepath;

            await tx.book.update({ where: { id: survivorId }, data });

            // 4. Append-only audit entry.
            await tx.bookMergeEvent.create({
                data: { canonicalId: survivorId, duplicateId: removedId, snapshot, performedById: me.id },
            });
        });

        revalidateAdmin();
        return { ok: true, message: 'Livres fusionnés avec succès' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        const map: Record<string, string> = {
            SURVIVOR_NOT_FOUND: 'Le livre à conserver est introuvable',
            REMOVED_NOT_FOUND: 'Le doublon est introuvable',
            AUDIO_CONFLICT:
                'Double enregistrement audio : la fusion est bloquée. Ce doublon nécessite une vérification manuelle.',
        };
        console.error('fuseBooks error:', error);
        return { ok: false, message: map[msg] ?? 'Échec de la fusion. Aucune modification enregistrée.' };
    }
}

/** DELETE: hard-delete one book. Blocked (with a clear message) if it's referenced by demandes/attributions. */
export async function deleteBook(bookId: number): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(bookId)) return { ok: false, message: 'Identifiant invalide' };

    try {
        await prisma.book.delete({ where: { id: bookId } });
        revalidateAdmin();
        return { ok: true, message: 'Livre supprimé avec succès' };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2025') return { ok: false, message: 'Livre introuvable' };
            if (error.code === 'P2003') {
                return {
                    ok: false,
                    message: 'Ce livre est rattaché à des demandes ou attributions. Fusionnez-le plutôt que de le supprimer.',
                };
            }
        }
        console.error('deleteBook error:', error);
        return { ok: false, message: 'Échec de la suppression' };
    }
}

/** NOT A DUP: clear the review flag on the flagged book — no merge, no delete. */
export async function dismissReview(bookId: number): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(bookId)) return { ok: false, message: 'Identifiant invalide' };

    try {
        await prisma.book.update({ where: { id: bookId }, data: { needsReview: false } });
        revalidateAdmin();
        return { ok: true, message: 'Livre retiré de la file de révision' };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return { ok: false, message: 'Livre introuvable' };
        }
        console.error('dismissReview error:', error);
        return { ok: false, message: 'Échec de la mise à jour' };
    }
}
