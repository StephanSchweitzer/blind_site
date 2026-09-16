// app/api/news/search/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { buildNewsSearchWhere } from '@/lib/search';

export async function GET(req: NextRequest) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const term = searchParams.get('term');

        if (!term) {
            return NextResponse.json([]);
        }

        // Le même moteur que la liste et que /api/news, pour que l'autocomplétion
        // et la page qu'elle mène ne trouvent jamais des choses différentes.
        const tokenClauses = buildNewsSearchWhere(term);
        if (!tokenClauses) {
            return NextResponse.json([]);
        }
        const where: Prisma.NewsWhereInput = { AND: tokenClauses };

        const results = await prisma.news.findMany({
            where,
            take: 5,
            orderBy: {
                publishedAt: 'desc'
            },
            select: {
                id: true,
                title: true,
                publishedAt: true
            }
        });

        return NextResponse.json(results);

    } catch (error) {
        console.error('Error searching news:', error);
        return NextResponse.json(
            { error: 'Failed to search news' },
            { status: 500 }
        );
    }
}