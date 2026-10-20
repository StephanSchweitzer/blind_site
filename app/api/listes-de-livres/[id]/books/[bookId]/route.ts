import { NextResponse } from 'next/server';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { LIST_NOTE_MAX_LENGTH, normalizeListNote } from '@/lib/books/listEntries';

/** The composite key from the route params, or null when either part isn't numeric. */
async function keyFrom(params?: Promise<Record<string, string>>) {
    const { id, bookId } = (await params) ?? {};
    const coupsDeCoeurId = Number(id);
    const book = Number(bookId);
    if (!Number.isInteger(coupsDeCoeurId) || !Number.isInteger(book)) return null;
    return { coupsDeCoeurId, bookId: book };
}

const invalidId = () => NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });

export const GET = withAdmin(async (_req, { params }) => {
    const key = await keyFrom(params);
    if (!key) return invalidId();

    try {
        const relation = await prisma.coupsDeCoeurBooks.findUnique({
            where: {
                coupsDeCoeurId_bookId: key
            }
        });

        if (!relation) {
            return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: relation });
    } catch (error) {
        console.error('Failed to check book in coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to check book' }, { status: 500 });
    }
});

export const POST = withAdmin(async (_req, { params }) => {
    const key = await keyFrom(params);
    if (!key) return invalidId();

    try {
        const newRelation = await prisma.coupsDeCoeurBooks.create({
            data: key
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json({ success: true, data: newRelation });
    } catch (error) {
        console.error('Failed to add book to coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to add book' }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (_req, { params }) => {
    const key = await keyFrom(params);
    if (!key) return invalidId();

    try {
        await prisma.coupsDeCoeurBooks.delete({
            where: {
                coupsDeCoeurId_bookId: key
            }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to remove book from coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to remove book' }, { status: 500 });
    }
});

/**
 * La note de ce livre dans cette liste, enregistrée seule : l'éditeur la pose
 * sans attendre « Enregistrer », pour un livre déjà enregistré dans la liste.
 * Un livre que la liste ne contient pas encore n'a pas de ligne ici — sa note
 * part avec la liste (PUT /api/listes-de-livres/[id]).
 */
export const PATCH = withAdmin(async (req, { params }) => {
    const key = await keyFrom(params);
    if (!key) return invalidId();

    const body = await req.json().catch(() => null);
    const raw: unknown = body?.note;
    if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json({ error: 'Note invalide' }, { status: 400 });
    }
    const note = normalizeListNote(raw);
    if (note && note.length > LIST_NOTE_MAX_LENGTH) {
        return NextResponse.json({ error: `La note dépasse ${LIST_NOTE_MAX_LENGTH} caractères` }, { status: 400 });
    }

    try {
        const relation = await prisma.coupsDeCoeurBooks.findUnique({
            where: { coupsDeCoeurId_bookId: key },
            select: { note: true, coupsDeCoeur: { select: { active: true } } }
        });
        if (!relation) {
            return NextResponse.json({ error: "Ce livre n'est pas dans la liste" }, { status: 404 });
        }
        if (relation.note === note) return NextResponse.json({ success: true, note });

        await prisma.coupsDeCoeurBooks.update({
            where: { coupsDeCoeurId_bookId: key },
            data: { note }
        });

        // Une liste masquée n'est pas sur le site : rien à régénérer.
        if (relation.coupsDeCoeur.active) {
            revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');
        }

        return NextResponse.json({ success: true, note });
    } catch (error) {
        console.error('Failed to save list note:', error);
        return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
    }
});
