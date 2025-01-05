// app/api/news/search/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const term = searchParams.get('term');

        if (!term) {
            return NextResponse.json([]);
        }

        const where: Prisma.NewsWhereInput = {
            OR: [
                {
                    title: {
                        contains: term,
                        mode: 'insensitive'
                    } as Prisma.StringFilter<"News">
                },
                {
                    content: {
                        contains: term,
                        mode: 'insensitive'
                    } as Prisma.StringFilter<"News">
                }
            ]
        };

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