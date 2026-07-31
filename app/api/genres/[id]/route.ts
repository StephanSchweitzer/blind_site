// app/api/genres/[id]/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidateCatalogue } from '@/lib/revalidate-public';
import { withAdmin } from '@/lib/auth/guards';

export const PUT = withAdmin(async (request, { params }) => {
    revalidateAdmin();
    try {
        const body = await request.json();

        if (!body?.name) {
            return NextResponse.json(
                { error: 'Name is required' },
                { status: 400 }
            );
        }

        const { id } = (await params) ?? {};
        const genreId = Number(id);
        if (!Number.isInteger(genreId)) {
            return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
        }

        const genre = await prisma.genre.update({
            where: {
                id: genreId
            },
            data: {
                name: body.name,
                description: body.description || null
            }
        });

        revalidateCatalogue();

        return NextResponse.json(
            { data: genre },
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                }
            }
        );
    } catch (error) {
        console.error('Error updating genre:', error);
        return NextResponse.json(
            { error: 'Failed to update genre' },
            { status: 500 }
        );
    }
});

export const DELETE = withAdmin(async (_request, { params }) => {
    revalidateAdmin();
    try {
        const { id } = (await params) ?? {};
        const genreId = Number(id);
        if (!Number.isInteger(genreId)) {
            return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
        }

        await prisma.genre.delete({
            where: { id: genreId },
        });

        revalidateCatalogue();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error deleting genre:', error);

        return NextResponse.json(
            { error: 'Failed to delete genre' },
            { status: 500 }
        );
    }
});
