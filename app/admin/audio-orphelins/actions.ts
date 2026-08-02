'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { listRawObjects } from '@/lib/audio/bucket';
import { refreshBookAudioState } from '@/lib/audio/state';

/**
 * Rattachement d'un dossier audio orphelin à un livre.
 *
 * NOTHING IN THE BUCKET IS TOUCHED here either — exactly as in
 * scripts/sync-audio-links.ts. Linking means pointing Book.audio_filepath at the
 * folder that already exists; no copy, no rename, no delete. The audio stays
 * where it is, which is the only reason any of this is safe to do from a web page.
 */

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const AUDIO_EXT = /[.](mp3|m4a|m4b|wav|ogg|opus|flac|aac|wma|aiff?)$/i;

async function requireAdmin() {
    const me = await getCurrentUser();
    if (!me || !isAdmin(me.accessLevel)) return null;
    return me;
}

/**
 * Is this folder genuinely spoken for?
 *
 * `resolvedAt` alone is not enough: linkedBookId is `onDelete: SetNull`, so a
 * row whose book was deleted still carries the stamp while pointing at nothing.
 * The folder is orphaned again at that point and must be actionable, otherwise
 * an admin's mistake on the doublons screen quietly takes a recording out of the
 * queue for good.
 */
const isLinked = (o: { resolvedAt: Date | null; linkedBookId: number | null }): boolean =>
    o.resolvedAt !== null && o.linkedBookId !== null;

/** Append a dated line to the row's note rather than overwriting the previous one. */
function appendNote(existing: string | null, line: string): string {
    const stamped = `${new Date().toLocaleDateString('fr-FR')} — ${line}`;
    return existing?.trim() ? `${existing.trim()}\n${stamped}` : stamped;
}

/**
 * Does this folder hold something worth protecting?
 *
 * Used before overwriting a book's existing audio_filepath. A folder that is
 * empty or absent can be replaced without losing anything; one holding actual
 * tracks cannot, and the request is refused rather than confirmed away.
 */
async function folderAudioCount(prefix: string): Promise<number> {
    if (!prefix.trim()) return 0;
    const objects = await listRawObjects(prefix.endsWith('/') ? prefix : `${prefix}/`);
    return objects.filter((o) => AUDIO_EXT.test(o.key)).length;
}

interface LinkOptions {
    /** Set once the permanent has confirmed replacing an existing (empty) path. */
    confirmReplace?: boolean;
}

/**
 * LINK: point an existing book at this folder.
 *
 * Three outcomes, in increasing order of danger:
 *  - the book has no path        → linked outright
 *  - the book's path is empty or missing in the bucket → linked after confirmation
 *  - the book's path holds real tracks → REFUSED. Two folders of audio for one
 *    book is the `#recycle` case: a NAS recycle-bin copy of a folder the book is
 *    already using. Overwriting would silently orphan the good recording, so the
 *    permanent is told to écarter the duplicate instead.
 */
export async function linkOrphanToBook(
    orphanId: number,
    bookId: number,
    options: LinkOptions = {},
): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(orphanId) || !Number.isInteger(bookId)) {
        return { ok: false, message: 'Identifiants invalides' };
    }

    try {
        const orphan = await prisma.orphanAudioFolder.findUnique({ where: { id: orphanId } });
        if (!orphan) return { ok: false, message: 'Dossier orphelin introuvable' };
        if (isLinked(orphan)) {
            return { ok: false, message: 'Ce dossier est déjà rattaché à un livre' };
        }

        const book = await prisma.book.findUnique({
            where: { id: bookId },
            select: { id: true, title: true, audio_filepath: true },
        });
        if (!book) return { ok: false, message: 'Livre introuvable' };

        // Two books sharing one folder means deleting a track from one silently
        // empties the other. Catch it here rather than discovering it later.
        const holder = await prisma.book.findFirst({
            where: { id: { not: bookId }, audio_filepath: orphan.prefix },
            select: { id: true, title: true },
        });
        if (holder) {
            return {
                ok: false,
                message: `Ce dossier est déjà utilisé par « ${holder.title} » (#${holder.id}). Un dossier ne peut appartenir qu'à un seul livre.`,
            };
        }

        const existing = book.audio_filepath?.trim() ?? '';
        let note = orphan.note;

        if (existing && existing !== orphan.prefix) {
            const count = await folderAudioCount(existing);
            if (count > 0) {
                return {
                    ok: false,
                    message:
                        `« ${book.title} » possède déjà un dossier audio contenant ${count} piste${count > 1 ? 's' : ''}. ` +
                        `Si ce dossier orphelin en est une copie (corbeille du NAS), écartez-le plutôt que de le rattacher.`,
                };
            }
            if (!options.confirmReplace) {
                return {
                    ok: false,
                    message: `CONFIRM_REPLACE:${existing}`,
                };
            }
            note = appendNote(note, `ancien chemin du livre #${book.id} remplacé (dossier vide) : ${existing}`);
        }

        await prisma.book.update({
            where: { id: bookId },
            data: { audio_filepath: orphan.prefix },
        });
        // Recount from the bucket so audioLinkStatus/audioTrackCount are right
        // immediately, instead of waiting for the next sync run.
        const state = await refreshBookAudioState(bookId);

        await prisma.orphanAudioFolder.update({
            where: { id: orphanId },
            data: {
                linkedBookId: bookId,
                resolvedAt: new Date(),
                dismissedAt: null,
                note: appendNote(note, `rattaché au livre #${bookId} par ${me.email ?? `#${me.id}`}`),
            },
        });

        revalidateAdmin();
        revalidateCatalogue();
        return {
            ok: true,
            message: `Dossier rattaché à « ${book.title} » — ${state.trackCount ?? 0} piste${(state.trackCount ?? 0) > 1 ? 's' : ''}.`,
        };
    } catch (error) {
        console.error('linkOrphanToBook error:', error);
        return { ok: false, message: 'Échec du rattachement. Aucune modification enregistrée.' };
    }
}

export interface NewBookInput {
    title: string;
    author: string;
    publishedDate?: string;
    readingDurationMinutes?: string;
}

/**
 * CREATE + LINK: no catalogue entry exists for this recording, so make one.
 *
 * `source_access_id` gets the folder number when it is still free — that number
 * is the Access import's identifier and the join key the sync job uses to
 * suggest a book, so filling it in is what stops the same folder coming back as
 * an orphan needing the same detective work next time.
 */
export async function createBookForOrphan(
    orphanId: number,
    input: NewBookInput,
): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(orphanId)) return { ok: false, message: 'Identifiant invalide' };

    const title = input.title?.trim();
    const author = input.author?.trim();
    if (!title) return { ok: false, message: 'Le titre est obligatoire' };
    if (!author) return { ok: false, message: "L'auteur est obligatoire" };

    try {
        const orphan = await prisma.orphanAudioFolder.findUnique({ where: { id: orphanId } });
        if (!orphan) return { ok: false, message: 'Dossier orphelin introuvable' };
        if (isLinked(orphan)) {
            return { ok: false, message: 'Ce dossier est déjà rattaché à un livre' };
        }

        const holder = await prisma.book.findFirst({
            where: { audio_filepath: orphan.prefix },
            select: { id: true, title: true },
        });
        if (holder) {
            return {
                ok: false,
                message: `Ce dossier est déjà utilisé par « ${holder.title} » (#${holder.id}).`,
            };
        }

        // Only claim the folder number if no other book carries it — it is not
        // unique in the schema, but two rows sharing one would break the
        // suggestion lookup for both.
        const numberTaken =
            orphan.folderNum != null &&
            (await prisma.book.count({ where: { source_access_id: orphan.folderNum } })) > 0;

        const duration = Number(input.readingDurationMinutes);
        const published = input.publishedDate ? new Date(input.publishedDate) : null;

        const book = await prisma.book.create({
            data: {
                title,
                author,
                publishedDate: published && !isNaN(published.getTime()) ? published : null,
                readingDurationMinutes: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
                available: true,
                addedById: me.id,
                audio_filepath: orphan.prefix,
                source_access_id: !numberTaken ? orphan.folderNum : null,
            },
            select: { id: true, title: true },
        });

        const state = await refreshBookAudioState(book.id);

        await prisma.orphanAudioFolder.update({
            where: { id: orphanId },
            data: {
                linkedBookId: book.id,
                resolvedAt: new Date(),
                dismissedAt: null,
                note: appendNote(
                    orphan.note,
                    `livre #${book.id} créé pour ce dossier par ${me.email ?? `#${me.id}`}` +
                        (numberTaken ? ` (n° ${orphan.folderNum} déjà pris, non repris)` : ''),
                ),
            },
        });

        revalidateAdmin();
        revalidateCatalogue();
        return {
            ok: true,
            message: `Livre « ${book.title} » (#${book.id}) créé et rattaché — ${state.trackCount ?? 0} piste${(state.trackCount ?? 0) > 1 ? 's' : ''}.`,
        };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return { ok: false, message: 'Un livre avec cet ISBN existe déjà' };
        }
        console.error('createBookForOrphan error:', error);
        return { ok: false, message: 'Échec de la création. Aucune modification enregistrée.' };
    }
}

/**
 * UNDO: detach a folder that was linked by mistake.
 *
 * The book goes back to having no audio folder at all, even if it carried a
 * different (empty) path before — that old value is only kept in the row's note,
 * which is deliberate: this is a correction path, not a full history.
 */
export async function unlinkOrphan(orphanId: number): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(orphanId)) return { ok: false, message: 'Identifiant invalide' };

    try {
        const orphan = await prisma.orphanAudioFolder.findUnique({ where: { id: orphanId } });
        if (!orphan) return { ok: false, message: 'Dossier orphelin introuvable' };
        if (!orphan.linkedBookId) return { ok: false, message: "Ce dossier n'est rattaché à aucun livre" };

        const book = await prisma.book.findUnique({
            where: { id: orphan.linkedBookId },
            select: { id: true, audio_filepath: true },
        });

        // Only clear the path if it still points here: the book may have been
        // re-pointed elsewhere since, and that newer decision wins.
        if (book && book.audio_filepath?.trim() === orphan.prefix) {
            await prisma.book.update({ where: { id: book.id }, data: { audio_filepath: null } });
            await refreshBookAudioState(book.id);
        }

        await prisma.orphanAudioFolder.update({
            where: { id: orphanId },
            data: {
                linkedBookId: null,
                resolvedAt: null,
                note: appendNote(
                    orphan.note,
                    `rattachement au livre #${orphan.linkedBookId} annulé par ${me.email ?? `#${me.id}`}`,
                ),
            },
        });

        revalidateAdmin();
        revalidateCatalogue();
        return { ok: true, message: 'Rattachement annulé — le dossier est de nouveau orphelin.' };
    } catch (error) {
        console.error('unlinkOrphan error:', error);
        return { ok: false, message: "Échec de l'annulation" };
    }
}

/**
 * DISMISS: this folder belongs to no book and never will — a NAS recycle-bin
 * copy, a sync conflict duplicate, a stray upload.
 *
 * Nothing is deleted from the bucket. The row is kept precisely so the decision
 * survives: scripts/sync-audio-links.ts preserves dismissed rows instead of
 * re-queueing the folder on every run.
 */
export async function dismissOrphan(orphanId: number, reason: string): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(orphanId)) return { ok: false, message: 'Identifiant invalide' };

    const motif = reason?.trim();
    if (!motif) return { ok: false, message: 'Indiquez pourquoi ce dossier est écarté' };

    try {
        const orphan = await prisma.orphanAudioFolder.findUnique({ where: { id: orphanId } });
        if (!orphan) return { ok: false, message: 'Dossier orphelin introuvable' };
        if (isLinked(orphan)) {
            return { ok: false, message: 'Ce dossier est rattaché à un livre — annulez le rattachement d\'abord' };
        }

        await prisma.orphanAudioFolder.update({
            where: { id: orphanId },
            data: {
                dismissedAt: new Date(),
                note: appendNote(orphan.note, `écarté par ${me.email ?? `#${me.id}`} : ${motif}`),
            },
        });

        revalidateAdmin();
        return { ok: true, message: 'Dossier écarté. Rien n’a été supprimé du stockage.' };
    } catch (error) {
        console.error('dismissOrphan error:', error);
        return { ok: false, message: "Échec de la mise à l'écart" };
    }
}

/** UNDO DISMISS: put an écarté folder back in the queue. */
export async function restoreOrphan(orphanId: number): Promise<ActionResult> {
    const me = await requireAdmin();
    if (!me) return { ok: false, message: 'Permissions insuffisantes' };
    if (!Number.isInteger(orphanId)) return { ok: false, message: 'Identifiant invalide' };

    try {
        const orphan = await prisma.orphanAudioFolder.findUnique({ where: { id: orphanId } });
        if (!orphan) return { ok: false, message: 'Dossier orphelin introuvable' };

        await prisma.orphanAudioFolder.update({
            where: { id: orphanId },
            data: {
                dismissedAt: null,
                note: appendNote(orphan.note, `remis dans la file par ${me.email ?? `#${me.id}`}`),
            },
        });

        revalidateAdmin();
        return { ok: true, message: 'Dossier remis dans la file à traiter.' };
    } catch (error) {
        console.error('restoreOrphan error:', error);
        return { ok: false, message: 'Échec de la restauration' };
    }
}
