// app/api/news/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {News, Prisma} from '@prisma/client';
import { newsTypeLabels } from '@/types/news';

export async function POST(req: NextRequest) {
    let session;

    try {
        session = await getServerSession(authOptions);
        console.log("Session retrieved:", session);
    } catch (error) {
        console.error("Session retrieval failed:", error);
        return NextResponse.json(
            { error: 'Erreur d\'authentification' },
            { status: 500 }
        );
    }

    if (!session?.user?.id) {
        console.log("Invalid session:", session);
        return NextResponse.json(
            { error: 'Non autorisé' },
            { status: 401 }
        );
    }

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

    // Author ID parsing
    let parsedAuthorId;
    try {
        parsedAuthorId = parseInt(session.user.id, 10);
        if (isNaN(parsedAuthorId)) {
            throw new Error('Format d\'ID auteur invalide');
        }
    } catch (error) {
        console.error("Author ID parsing failed:", error);
        return NextResponse.json(
            { error: 'ID auteur invalide' },
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
                authorId: parsedAuthorId,
                publishedAt: new Date(),
            },
        });
        console.log("Article created:", newArticle);

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
}

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