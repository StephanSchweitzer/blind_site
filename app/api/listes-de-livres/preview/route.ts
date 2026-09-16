import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { buildPublicCoupsDeCoeurSearchWhere } from '@/lib/search';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';

        // Tokenisé et insensible aux apostrophes comme le catalogue public —
        // voir buildPublicCoupsDeCoeurSearchWhere.
        const tokenClauses = buildPublicCoupsDeCoeurSearchWhere(search);
        if (!tokenClauses) {
            return NextResponse.json([]);
        }

        const results = await prisma.coupsDeCoeur.findMany({
            where: {
                // `active: false` retire une liste du site — c'est le geste par
                // lequel un permanent la dépublie. Sans ce filtre, la recherche
                // publique continuait d'en proposer le titre et la description,
                // et le clic menait vers une page qui ne la contient pas : le
                // reste du site (app/listes-de-livres/data.ts, et jusqu'à la
                // route d'administration) ne lit QUE les listes actives.
                active: true,
                AND: tokenClauses,
            },
            select: {
                id: true,
                title: true,
                description: true
            },
            take: 5,
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json(results);
    } catch (error) {
        console.error('Failed to fetch preview results:', error);
        return NextResponse.json({ error: 'Failed to fetch preview results' }, { status: 500 });
    }
}