// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { resolvePrefix } from '@/lib/audio/state';
import { listBookTracks } from '@/lib/audio/bucket';
import { softDeleteTracks } from '@/lib/audio/trash';
import { resolveMergedBook } from '@/lib/books/merged';
import { BookUpdateInputSchema } from '@/types/api/book.api';

/**
 * Applies to every handler in this file (GET/PUT are quick single-row
 * queries; only DELETE's audio cascade needs headroom). softDeleteTracks
 * copies 10-wide, and the largest folder sampled in the corpus
 * (audit-audio-files.ts) held 77 tracks — ~8 pooled batches. 45s keeps real
 * margin over that for an unusually large folder, while staying inside the
 * ~60s that's configurable even on the smallest Vercel tier (the repo
 * doesn't record which plan this project is on; raise this if it turns out
 * to allow more).
 */
export const maxDuration = 45;

const invalidId = () => NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

/** Numeric book id from the route params, or null when it isn't one. */
async function bookIdFrom(params?: Promise<Record<string, string>>): Promise<number | null> {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    return Number.isInteger(bookId) ? bookId : null;
}

// Admin-only, including the read: this route exposes staff details (addedBy
// name/email) and is only ever called from the back office. The public
// catalogue reads through the collection route (`/api/books`), which stays
// open — so guarding here costs the public pages nothing.
export const GET = withAdmin(async (_req, { params }) => {
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        const book = await prisma.book.findUnique({
            where: { id: bookId },
            include: {
                genres: {
                    include: {
                        genre: true
                    }
                },
                addedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        if (!book) {
            // A fused book is not missing, it moved: say where, so the caller can
            // follow instead of reporting a dead end. See lib/books/merged.ts.
            const merged = await resolveMergedBook(bookId);
            if (merged) {
                return NextResponse.json(
                    {
                        error: 'Book merged',
                        mergedInto: merged.canonicalId,
                        mergedAt: merged.mergedAt.toISOString(),
                    },
                    { status: 404 }
                );
            }
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }

        return NextResponse.json(book);
    } catch (error) {
        console.error('Failed to fetch book:', error);
        return NextResponse.json({ error: 'Failed to fetch book' }, { status: 400 });
    }
});

/**
 * `readingDurationMinutes` is deliberately NOT read from the body.
 *
 * It is derived from the audio files and has exactly one writer,
 * refreshBookAudioState() (lib/audio/state.ts) — the « Recalculer » button
 * routes its write through that function for the same reason, and no form has
 * offered a field to type the duration in since it became a fact about the
 * recording rather than an opinion about it.
 *
 * The book form nevertheless carried the value in its state and sent it back on
 * every save, mapping « pas de valeur » to an explicit null. The form is seeded
 * once, when it opens, so anything that filled the duration afterwards — an
 * upload made from the audio button in that same modal's header, another
 * permanent measuring, a second tab — was erased by the next save of any other
 * field. Accepting the column here can only ever overwrite a measurement with a
 * stale copy of itself, so the route no longer takes it at all.
 */
export const PUT = withAdmin(async (req, { params }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    const validation = BookUpdateInputSchema.safeParse(await req.json());
    if (!validation.success) {
        return NextResponse.json(
            { error: 'Invalid data', message: 'Données invalides', errors: validation.error.issues },
            { status: 400 }
        );
    }

    const {
        title,
        subtitle,
        author,
        publisher,
        publishedDate,
        genres,
        isbn,
        description,
        available,
        hiddenFromCatalogue,
        pageCount
    } = validation.data;

    if (isbn?.trim()) {
        const existingBook = await prisma.book.findFirst({
            where: {
                isbn,
                NOT: { id: bookId }
            }
        });

        if (existingBook) {
            return NextResponse.json(
                {
                    error: 'Another book with this ISBN already exists',
                    message: 'Another book with this ISBN already exists'
                },
                { status: 409 }
            );
        }
    }

    try {
        // L'annonce vocale du livre est un CACHE, et il faut l'invalider ici.
        //
        // /api/polly synthétise une fois puis stocke l'URL dans polly_audio_url,
        // et son propre commentaire pose le contrat : « Clear polly_audio_url in
        // the book update route when title/author/duration/description change, so
        // the cached audio regenerates. » Personne ne l'a jamais fait — dans tout
        // le dépôt la colonne n'était écrite qu'à la synthèse. Corriger le titre
        // d'un livre changeait donc la page du catalogue pendant que l'annonce
        // continuait d'énoncer l'ancien texte, pour toujours, et de façon invisible
        // pour un permanent voyant qui vérifie sa saisie.
        //
        // readingDurationMinutes fait partie de l'annonce mais ne passe pas par
        // cette route (il est dérivé de l'audio) : c'est refreshBookAudioState qui
        // devra l'invalider le jour où la durée entrera dans le texte lu.
        const current = await prisma.book.findUnique({
            where: { id: bookId },
            select: { title: true, author: true, description: true },
        });
        if (!current) {
            return NextResponse.json({ error: 'Livre introuvable' }, { status: 404 });
        }
        const spokenFieldsChanged =
            (title !== undefined && title !== current.title) ||
            (author !== undefined && author !== current.author) ||
            (description !== undefined && (description ?? null) !== current.description);

        const updatedBook = await prisma.book.update({
            where: { id: bookId },
            data: {
                title,
                subtitle,
                author,
                publisher,
                // `=== undefined` plutôt que la seule vérité : sans ça, envoyer null
                // pour retirer une date erronée était lu comme « ne touche à rien »,
                // et une date saisie par erreur ne pouvait être que remplacée.
                publishedDate:
                    publishedDate === undefined ? undefined : (publishedDate ? new Date(publishedDate) : null),
                isbn,
                description,
                pageCount,
                available,
                hiddenFromCatalogue,
                ...(spokenFieldsChanged ? { polly_audio_url: null } : {}),
                // Les genres ne sont remplacés QUE s'ils sont fournis.
                //
                // Le `deleteMany: {}` était inconditionnel tandis que le `create`
                // portait un `?.` : un corps sans `genres` supprimait donc tous les
                // genres du livre et n'en recréait aucun. Les deux formulaires les
                // envoient, ce qui est exactement pourquoi la perte ne se voyait pas.
                ...(genres !== undefined
                    ? {
                          genres: {
                              deleteMany: {},
                              create: genres.map((genreId) => ({
                                  genre: { connect: { id: Number(genreId) } },
                              })),
                          },
                      }
                    : {}),
            },
            include: {
                genres: {
                    include: {
                        genre: true
                    }
                },
                addedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        revalidateCatalogue();

        return NextResponse.json({
            message: 'Book updated successfully',
            book: updatedBook
        });
    } catch (error) {
        console.error('Failed to update book:', error);
        return NextResponse.json({ error: 'Failed to update book' }, { status: 400 });
    }
});

/**
 * Deleting a book also removes its audio from the bucket — through the same
 * corbeille path as a manual track delete, not a raw bucket wipe, so a book
 * deleted by mistake still leaves its recordings recoverable for the same 14
 * days as everything else in lib/audio/purge.ts.
 *
 * Order matters: tracks are moved to the corbeille BEFORE the book row is
 * deleted, because DeletedAudioTrack.bookId is a real foreign key — it can
 * only be set on insert while the book still exists (onDelete: SetNull only
 * fires afterwards, once, on rows that already reference it). Deleting the
 * book first and soft-deleting after would violate that constraint.
 *
 * Orders/Assignment reference Book with no onDelete override (Postgres
 * RESTRICT), so a book with any request or attribution history can't be
 * deleted at all — checked up front, before the bucket is touched. Otherwise
 * a book that turns out to be undeletable would still have had its audio
 * folder emptied for nothing.
 */
export const DELETE = withAdmin(async (_request, { params, me }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        const book = await prisma.book.findUnique({
            where: { id: bookId },
            select: { audio_filepath: true },
        });
        if (!book) {
            return NextResponse.json({ error: 'Livre introuvable' }, { status: 404 });
        }

        const [orderCount, assignmentCount] = await Promise.all([
            prisma.orders.count({ where: { catalogueId: bookId } }),
            prisma.assignment.count({ where: { catalogueId: bookId } }),
        ]);
        if (orderCount > 0 || assignmentCount > 0) {
            return NextResponse.json(
                { error: 'Ce livre a des demandes ou attributions associées et ne peut pas être supprimé.' },
                { status: 409 }
            );
        }

        const audioFailures: string[] = [];
        const prefix = resolvePrefix(book.audio_filepath);
        if (prefix) {
            const tracks = await listBookTracks(prefix);
            const result = await softDeleteTracks({
                bookId,
                prefix,
                tracks: tracks.map((t) => ({
                    key: t.key,
                    name: t.name,
                    sizeBytes: t.sizeBytes,
                })),
                userId: me.id,
                // Nothing will be left to hold a placeholder for, or to describe.
                skipFinalisation: true,
            });
            audioFailures.push(...result.failed.map((f) => f.filename));

            // Refuse rather than delete the book over the top of tracks still in
            // its folder. Doing so used to leave the recording stranded under a
            // prefix no record pointed at, and no way to tell how far the move
            // had got. The move is resumable, so the honest answer is to say
            // what is stuck and let the permanent press Supprimer again.
            if (result.failed.length) {
                return NextResponse.json(
                    {
                        error:
                            `${result.failed.length} fichier(s) audio n’ont pas pu être déplacés ` +
                            'vers la corbeille. Le livre n’a pas été supprimé. Relancez la ' +
                            'suppression : les fichiers déjà déplacés ne le seront pas deux fois.',
                        audioFailures,
                        details: result.failed,
                    },
                    { status: 502 },
                );
            }
        }

        await prisma.book.delete({
            where: { id: bookId }
        });

        revalidateCatalogue();

        return NextResponse.json(
            { success: true, audioFailures },
            { status: 200 }
        );
    } catch (error) {
        console.error('Error deleting book:', error);
        return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
    }
});
