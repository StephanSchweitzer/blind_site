import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search') || '';

        if (!search) {
            return NextResponse.json([]);
        }

        const results = await prisma.coupsDeCoeur.findMany({
            where: {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                    {
                        books: {
                            some: {
                                book: {
                                    OR: [
                                        { title: { contains: search, mode: 'insensitive' } },
                                        { author: { contains: search, mode: 'insensitive' } }
                                    ]
                                }
                            }
                        }
                    }
                ]
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