// app/api/news/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import {News, Prisma} from '@prisma/client';
import { newsTypeLabels } from '@/types/news';
import { withAdmin } from '@/lib/auth/guards';

export const POST = withAdmin(async (req, { me }) => {
    revalidateAdmin();

    // Request body parsing
    let title, content, type;
    try {
        const body = await req.json();
        ({ title, content, type } = body);

        // Validate news type
        if (type && !Object.keys(newsTypeLabels).includes(type)) {
            return NextResponse.json(
                { error: 'Type d\'actualité invalide' },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error("Request parsing failed:", error);
        return NextResponse.json(
            { error: 'Format de requête invalide' },
            { status: 400 }
        );
    }

    // Input validation
    if (!title || !content) {
        console.log("Missing required fields - Title:", title, "Content:", content);
        return NextResponse.json(
            { error: 'Le titre et le contenu sont requis' },
            { status: 400 }
        );
    }

    // Database operation
    try {
        const newArticle = await prisma.news.create({
            data: {
                title,
                content,
                type: (type as News['type']) || 'GENERAL',
                authorId: me.id,
                publishedAt: new Date(),
            },
        });
        console.log("Article created:", newArticle);

        // On-demand invalidation of the public Dernières infos page.
        revalidatePublic(CACHE_TAGS.news, '/dernieres-infos');

        return NextResponse.json(
            { message: 'Article créé avec succès', article: newArticle },
            { status: 201 }
        );
    } catch (error) {
        console.error("Database operation failed:", error);
        return NextResponse.json(
            { error: 'Opération de base de données échouée' },
            { status: 500 }
        );
    }
});

export async function GET(req: NextRequest) {
    try {
        const searchParams = new URL(req.url).searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '5');
        const type = searchParams.get('type');
        const search = searchParams.get('search');

        const skip = (page - 1) * limit;

        // Build the where clause based on filters
        const where: Prisma.NewsWhereInput = {
            AND: [
                // Add type filter if provided and not 'all'
                ...(type && type !== 'all' ? [{
                    type: type as News['type']
                }] : []),
                // Add search filter if provided
                ...(search ? [{
                    OR: [
                        {
                            title: {
                                contains: search,
                                mode: 'insensitive' as Prisma.QueryMode
                            }
                        },
                        {
                            content: {
                                contains: search,
                                mode: 'insensitive' as Prisma.QueryMode
                            }
                        },
                        {
                            type: {
                                equals: search.toUpperCase() as News['type']
                            }
                        }
                    ]
                }] : [])
            ]
        };

        // Get total count for pagination
        const total = await prisma.news.count({ where });

        // Get paginated news posts
        const news = await prisma.news.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                publishedAt: 'desc'
            },
            include: {
                author: {
                    select: {
                        name: true
                    }
                }
            }
        });

        return NextResponse.json({
            items: news,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalItems: total
        });

    } catch (error) {
        console.error('Error fetching news:', error);
        return NextResponse.json(
            { error: 'Failed to fetch news', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}