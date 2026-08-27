import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

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
    revalidateAdmin();
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
                    description,
                    audioPath,
                    active: active ?? true,
                }
            });

            console.log(updated);

            // Delete and recreate relationships in bulk
            await tx.coupsDeCoeurBooks.deleteMany({
                where: { coupsDeCoeurId: coupId }
            });

            await tx.coupsDeCoeurBooks.createMany({
                data: bookIds.map(bookId => ({
                    coupsDeCoeurId: coupId,
                    bookId: parseInt(bookId, 10)
                }))
            });

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
    revalidateAdmin();
    const { id } = (await params) ?? {};
    const coupId = Number(id);
    if (!Number.isInteger(coupId)) {
        return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
    }

    try {
        // First delete the related CoupsDeCoeurBooks entries
        await prisma.coupsDeCoeurBooks.deleteMany({
            where: { coupsDeCoeurId: coupId }
        });

        // Then delete the CoupsDeCoeur entry
        await prisma.coupsDeCoeur.delete({
            where: { id: coupId }
        });

        revalidatePublic(CACHE_TAGS.coupsDeCoeur, '/listes-de-livres');

        return NextResponse.json({ message: 'Coup de coeur deleted successfully' });
    } catch (error) {
        console.error('Failed to delete coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to delete coup de coeur' }, { status: 500 });
    }
});