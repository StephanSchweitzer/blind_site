import { NextResponse } from 'next/server';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { isRecordNotFound, notFoundResponse } from '@/lib/api-errors';
// Back-office only. The public /listes-de-livres page reads the active list
// through `/api/listes-de-livres` (and /preview, /position), which stay open;
// this route is the editor's view of a single entry.
export const GET = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const coupId = Number(id);
    if (!Number.isInteger(coupId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const coupDeCoeur = await prisma.coupsDeCoeur.findUnique({
            where: { id: coupId },
            include: {
                books: {
                    include: {
                        // Genres are needed to group books the same way the public PDF
                        // export does — see CoupDeCoeurPDFButton.
                        book: { include: { genres: { include: { genre: true } } } }
                    }
                }
            }
        });

        if (!coupDeCoeur) {
            return NextResponse.json({ error: 'Coup de coeur not found' }, { status: 404 });
        }

        return NextResponse.json(coupDeCoeur);
    } catch (error) {
        console.error('Failed to fetch coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to fetch coup de coeur' }, { status: 500 });
    }
});

// PUT: Update a specific coup de coeur by ID
export const PUT = withAdmin(async (req, { params }) => {
    const { id } = (await params) ?? {};
    const coupId = Number(id);
    if (!Number.isInteger(coupId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        const { title, description, audioPath, bookIds, active } = await req.json();

        if (!title || !bookIds || !Array.isArray(bookIds)) {
            return NextResponse.json(
                { error: 'Title, description, audioPath, and bookIds array are required' },
                { status: 400 }
            );
        }

        const updatedCoupDeCoeur = await prisma.$transaction(async (tx) => {
            // Update the main record first
            const updated = await tx.coupsDeCoeur.update({
                where: { id: coupId },
                data: {
                    title,
                    description: description || null,
                    audioPath: audioPath || null,
                    active: active ?? true,
                }
            });

            console.log(updated);

            // Sync the set, never replace it: a delete-all + create-all would
            // make the journal report every book as removed then added.
            const wanted = new Set<number>(bookIds.map(bookId => parseInt(bookId, 10)));
            const current = await tx.coupsDeCoeurBooks.findMany({
                where: { coupsDeCoeurId: coupId },
                select: { bookId: true }
            });
            const present = new Set(current.map(row => row.bookId));

            const removed = [...present].filter(bookId => !wanted.has(bookId));
            if (removed.length > 0) {
                await tx.coupsDeCoeurBooks.deleteMany({
                    where: { coupsDeCoeurId: coupId, bookId: { in: removed } }
                });
            }

            const added = [...wanted].filter(bookId => !present.has(bookId));
            if (added.length > 0) {
                await tx.coupsDeCoeurBooks.createMany({
                    data: added.map(bookId => ({ coupsDeCoeurId: coupId, bookId }))
                });
            }

            // Fetch the final result
            return tx.coupsDeCoeur.findUnique({
                where: { id: coupId },
                include: {
                    books: {
                        include: {
                            book: true
                        }
                    }
                }
            });
        }, {
            timeout: 10000 // Increase timeout to 10 seconds just to be safe
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json({
            message: 'Coup de coeur updated successfully',
            coupDeCoeur: updatedCoupDeCoeur,
        });
    } catch (error) {
        console.error('Failed to update coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to update coup de coeur' }, { status: 500 });
    }
});

// DELETE: Delete a specific coup de coeur by ID
export const DELETE = withAdmin(async (_req, { params }) => {
    const { id } = (await params) ?? {};
    const coupId = Number(id);
    if (!Number.isInteger(coupId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        // Ses livres partent avec elle par cascade (CoupsDeCoeurBooks), en une
        // seule instruction : ni liste vidée mais restée en place, ni livres à
        // retirer d'abord. C'est aussi ce qui laisse le journal les voir encore
        // au moment de la suppression — il les garde dans l'instantané, et une
        // restauration les rattache.
        await prisma.coupsDeCoeur.delete({
            where: { id: coupId }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json({ message: 'Coup de coeur deleted successfully' });
    } catch (error) {
        if (isRecordNotFound(error)) return notFoundResponse('Liste introuvable');
        console.error('Failed to delete coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to delete coup de coeur' }, { status: 500 });
    }
});