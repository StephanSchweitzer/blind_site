import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

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
    revalidateAdmin();
    const key = await keyFrom(params);
    if (!key) return invalidId();

    try {
        const newRelation = await prisma.coupsDeCoeurBooks.create({
            data: key
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/coups-de-coeur');

        return NextResponse.json({ success: true, data: newRelation });
    } catch (error) {
        console.error('Failed to add book to coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to add book' }, { status: 500 });
    }
});

export const DELETE = withAdmin(async (_req, { params }) => {
    revalidateAdmin();
    const key = await keyFrom(params);
    if (!key) return invalidId();

    try {
        await prisma.coupsDeCoeurBooks.delete({
            where: {
                coupsDeCoeurId_bookId: key
            }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/coups-de-coeur');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to remove book from coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to remove book' }, { status: 500 });
    }
});
