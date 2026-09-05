import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { COUPS_DE_COEUR_PAGE_SIZE } from '@/app/listes-de-livres/data';

export async function GET(request: Request) {
    try {
        // Get the ID from the URL
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id || isNaN(Number(id))) {
            return NextResponse.json(
                { error: 'Invalid ID parameter' },
                { status: 400 }
            );
        }

        // La position doit être calculée sur EXACTEMENT la liste que la page
        // publique pagine — `active: true`, même tri (voir
        // app/listes-de-livres/data.ts). Comptées sur toutes les listes, les
        // positions se décalaient d'un cran pour chaque liste dépubliée plus
        // récente, et le résultat de recherche renvoyait vers la page d'une
        // autre liste.
        const allIds = await prisma.coupsDeCoeur.findMany({
            where: { active: true },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
        });

        // Find the position of the requested ID
        const position = allIds.findIndex(item => item.id === Number(id));

        if (position === -1) {
            return NextResponse.json(
                { error: 'Coup de coeur not found' },
                { status: 404 }
            );
        }

        const page = Math.floor(position / COUPS_DE_COEUR_PAGE_SIZE) + 1;

        return NextResponse.json({ page });
    } catch (error) {
        console.error('Error getting coup de coeur position:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}