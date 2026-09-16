// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { resolveMergedBook } from '@/lib/books/merged';
import {
    deleteBookWithAudio,
    type AudioDisposition,
    type AudioDispositionMode,
} from '@/lib/books/deleteBookWithAudio';
import { BookUpdateInputSchema } from '@/types/api/book.api';

/**
 * Applies to every handler in this file (GET/PUT are quick single-row
 * queries; only DELETE's audio cascade needs headroom — and only now that a
 * permanent asks for it explicitly, « envoyer à la corbeille » being one of
 * three dispositions rather than a silent side effect). softDeleteTracks
 * copies 10-wide, and the largest folder sampled in the corpus
 * (audit-audio-files.ts) held 77 tracks — ~8 pooled batches. 45s keeps real
 * margin over that for an unusually large folder, while staying inside the
 * ~60s that's configurable even on the smallest Vercel tier (the repo
 * doesn't record which plan this project is on; raise this if it turns out
 * to allow more).
 */
export const maxDuration = 45;

const invalidId = () => NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

/**
 * Une violation de clé étrangère, quelle que soit la couche qui l'a signalée.
 *
 * Avec l'adaptateur pg, l'erreur ne remonte pas toujours en
 * PrismaClientKnownRequestError P2003 : un RESTRICT arrive telle quelle depuis
 * le driver, en DriverAdapterError portant le SQLSTATE dans `cause`
 * (23001 pour un RESTRICT, 23503 pour une clé étrangère ordinaire). Les deux
 * formes sont donc reconnues.
 */
function isForeignKeyViolation(error: unknown): boolean {
    const codes = new Set(['P2003', '23001', '23503']);
    const seen = new Set<unknown>();
    let node: unknown = error;
    while (node && typeof node === 'object' && !seen.has(node)) {
        seen.add(node);
        const o = node as { code?: unknown; originalCode?: unknown; cause?: unknown };
        if (typeof o.code === 'string' && codes.has(o.code)) return true;
        if (typeof o.originalCode === 'string' && codes.has(o.originalCode)) return true;
        node = o.cause;
    }
    return false;
}

/** Numeric book id from the route params, or null when it isn't one. */
async function bookIdFrom(params?: Promise<Record<string, string>>): Promise<number | null> {
    const { id } = (await params) ?? {};
    const bookId = Number(id);
    return Number.isInteger(bookId) ? bookId : null;
}

// Admin-only, including the read: this route exposes staff details (addedBy
// name/email) and is only ever called from the back office. The public
// catalogue reads through `/api/catalogue` — so guarding here costs the public
// pages nothing.
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
        // readingDurationMinutes fait AUSSI partie du texte lu, mais ne passe pas
        // par cette route : il est dérivé de l'audio, et refreshBookAudioState en
        // est l'unique écrivain. C'est donc là qu'il est invalidé — sur un vrai
        // changement de durée, et pas à chaque relecture du bucket. Ce commentaire
        // disait auparavant que la durée n'était « pas encore » dans l'annonce ;
        // elle y était depuis le début, et personne ne l'invalidait.
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

/** Les trois dispositions, telles qu'un client peut les nommer. */
const AUDIO_MODES = new Set<AudioDispositionMode>(['leave', 'transfer', 'trash']);

/**
 * La décision audio portée par le corps de la requête, ou null s'il n'y en a pas.
 *
 * Un corps absent ou illisible vaut « pas de décision » : la suppression n'est
 * alors acceptée que si le dossier est vide (voir deleteBookWithAudio), au lieu
 * de tout envoyer à la corbeille comme le faisait le silence.
 */
function readDisposition(body: unknown): AudioDisposition | null {
    const audio = (body as { audio?: unknown } | null)?.audio;
    if (!audio || typeof audio !== 'object') return null;
    const { mode, targetBookId, confirmReplaceTarget, confirmTrackCount } = audio as {
        mode?: unknown;
        targetBookId?: unknown;
        confirmReplaceTarget?: unknown;
        confirmTrackCount?: unknown;
    };
    if (typeof mode !== 'string' || !AUDIO_MODES.has(mode as AudioDispositionMode)) return null;
    return {
        mode: mode as AudioDispositionMode,
        ...(Number.isInteger(targetBookId) ? { targetBookId: targetBookId as number } : {}),
        ...(confirmReplaceTarget === true ? { confirmReplaceTarget: true } : {}),
        ...(Number.isInteger(confirmTrackCount)
            ? { confirmTrackCount: confirmTrackCount as number }
            : {}),
    };
}

/**
 * Supprimer une fiche livre, l'enregistrement étant une décision explicite.
 *
 * La suppression déplaçait tout le dossier audio vers la corbeille, sans le
 * demander : lent au point de ne pas finir sur un gros dossier, et une troisième
 * copie d'un enregistrement que plus aucune fiche ne réclamerait. Le corps de la
 * requête porte donc `audio.mode` — `leave` (le dossier reste dans le bucket et
 * rejoint /admin/audio-orphelins), `transfer` (une autre fiche en hérite) ou
 * `trash` (l'ancien comportement, désormais choisi). Sans décision alors que le
 * dossier contient des pistes : 400, et la fenêtre de confirmation la demande.
 *
 * Tout le reste — les refus (demandes / attributions, dossier partagé avec une
 * autre fiche), l'ordre des écritures, la trace laissée à la corbeille — vit dans
 * lib/books/deleteBookWithAudio.ts, avec la suppression depuis Doublons.
 */
export const DELETE = withAdmin(async (request, { params, me }) => {
    revalidateAdmin();
    const bookId = await bookIdFrom(params);
    if (bookId === null) return invalidId();

    try {
        const result = await deleteBookWithAudio({
            bookId,
            performedById: me.id,
            disposition: readDisposition(await request.json().catch(() => null)),
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error, ...(result.extra ?? {}) },
                { status: result.status },
            );
        }

        revalidateCatalogue();

        return NextResponse.json(
            {
                success: true,
                audio: result.audio,
                // Conservé pour la fiche livre, qui sait déjà le dire : plus rien
                // ne le remplit, le mode `trash` refusant la suppression tant
                // qu'un fichier n'a pas rejoint la corbeille.
                audioFailures: [],
            },
            { status: 200 },
        );
    } catch (error) {
        console.error('Error deleting book:', error);
        // Filet : plus aucune clé étrangère connue ne devrait arriver ici (le
        // contrôle de deleteBookWithAudio couvre les deux relations en RESTRICT),
        // mais une contrainte ajoutée demain n'a pas à ressortir en « 500 Failed
        // to delete book » — c'est exactement le message qui n'apprenait rien.
        if (isForeignKeyViolation(error)) {
            return NextResponse.json(
                {
                    error:
                        'D’autres fiches ou enregistrements renvoient encore à ce livre, ' +
                        'la base a donc refusé la suppression. Le livre n’a pas été supprimé.',
                },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: 'La suppression du livre a échoué. Le livre n’a pas été supprimé.' },
            { status: 500 }
        );
    }
});
