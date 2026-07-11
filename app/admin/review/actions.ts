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

// Descriptive scalars copied onto the canonical only where it is null (never overwrite).
const FILLABLE = [
    'subtitle',
    'publishedDate',
    'isbn',
    'description',
    'publisher',
    'pageCount',
    'readingDurationMinutes',
    'audio_filepath',
    'polly_audio_url',
    'stock_date',
    'last_downloaded_date',
] as const;

/**
 * FUSE: merge a duplicate book into the canonical one, in a single transaction.
 * Reassigns relations, null-fills canonical scalars, deletes the duplicate, clears
 * the review flag, and appends an immutable BookMergeEvent with a snapshot.
 */
export async function fuseBooks(canonicalId: number, duplicateId: number): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(canonicalId) || !Number.isInteger(duplicateId)) {
        return { ok: false, message: 'Identifiants invalides' };
    }
    if (canonicalId === duplicateId) {
        return { ok: false, message: 'Un livre ne peut pas être fusionné avec lui-même' };
    }

    try {
        await prisma.$transaction(async (tx) => {
            const canonical = await tx.book.findUnique({ where: { id: canonicalId } });
            const duplicate = await tx.book.findUnique({ where: { id: duplicateId } });
            if (!canonical) throw new Error('CANONICAL_NOT_FOUND');
            if (!duplicate) throw new Error('DUPLICATE_NOT_FOUND');

            // 1. Reassign relations off the duplicate onto the canonical.
            //    Assignment/Orders reference the book via `catalogueId` (no unique constraint).
            await tx.assignment.updateMany({ where: { catalogueId: duplicateId }, data: { catalogueId: canonicalId } });
            await tx.orders.updateMany({ where: { catalogueId: duplicateId }, data: { catalogueId: canonicalId } });

            // BookGenre PK is (bookId, genreId): drop dup rows the canonical already has, move the rest.
            const canonGenres = await tx.bookGenre.findMany({ where: { bookId: canonicalId }, select: { genreId: true } });
            await tx.bookGenre.deleteMany({
                where: { bookId: duplicateId, genreId: { in: canonGenres.map((g) => g.genreId) } },
            });
            await tx.bookGenre.updateMany({ where: { bookId: duplicateId }, data: { bookId: canonicalId } });

            // CoupsDeCoeurBooks PK is (coupsDeCoeurId, bookId): same de-dup then move.
            const canonLists = await tx.coupsDeCoeurBooks.findMany({ where: { bookId: canonicalId }, select: { coupsDeCoeurId: true } });
            await tx.coupsDeCoeurBooks.deleteMany({
                where: { bookId: duplicateId, coupsDeCoeurId: { in: canonLists.map((c) => c.coupsDeCoeurId) } },
            });
            await tx.coupsDeCoeurBooks.updateMany({ where: { bookId: duplicateId }, data: { bookId: canonicalId } });

            // 2. Snapshot + delete the duplicate BEFORE writing scalars onto the canonical,
            //    so copying the duplicate's @unique isbn can't collide with the still-live row.
            const snapshot = JSON.parse(JSON.stringify(duplicate)) as Prisma.InputJsonValue;
            await tx.book.delete({ where: { id: duplicateId } });

            // 3. Null-fill canonical scalars from the duplicate (never overwrite non-null),
            //    then clear the review flag.
            const fill: Prisma.BookUpdateInput = {};
            for (const f of FILLABLE) {
                if (canonical[f] == null && duplicate[f] != null) {
                    (fill as Record<string, unknown>)[f] = duplicate[f];
                }
            }
            await tx.book.update({
                where: { id: canonicalId },
                data: { ...fill, needsReview: false, id_arbre: null },
            });

            // 4. Append-only audit entry.
            await tx.bookMergeEvent.create({
                data: { canonicalId, duplicateId, snapshot, performedById: me.id },
            });
        });

        revalidateAdmin();
        return { ok: true, message: 'Livres fusionnés avec succès' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        const map: Record<string, string> = {
            CANONICAL_NOT_FOUND: 'Le livre à conserver est introuvable',
            DUPLICATE_NOT_FOUND: 'Le doublon est introuvable',
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
