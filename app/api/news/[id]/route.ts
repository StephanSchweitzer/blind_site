// app/api/news/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { News } from '@prisma/client';
import { newsTypeLabels } from '@/types/news';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

// GET: Fetch a specific article by ID
export async function GET(req: NextRequest, { params }: RouteParams) {
    try {
        const { id: string_id } = await params;  // Correctly destructure 'id' and rename to string_id
        const id = parseInt(string_id, 10);

        if (isNaN(id)) {
            return NextResponse.json(
                { error: 'ID invalide' },
                { status: 400 }
            );
        }

        const article = await prisma.news.findUnique({
            where: { id },
            include: {
                author: {
                    select: {
                        name: true
                    }
                }
            }
        });

        if (!article) {
            return NextResponse.json(
                { error: 'Article non trouvé' },
                { status: 404 }
            );
        }

        return NextResponse.json(article);
    } catch (error) {
        console.error('Error fetching article:', error);
        return NextResponse.json(
            { error: 'Échec de la récupération de l\'article', details: error instanceof Error ? error.message : 'Erreur inconnue' },
            { status: 500 }
        );
    }
}

// PUT: Update a specific article by ID
export async function PUT(req: NextRequest, { params }: RouteParams) {
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

    try {
        const { id: string_id } = await params;  // Correctly destructure 'id' and rename to string_id
        const id = parseInt(string_id, 10);
        if (isNaN(id)) {
            return NextResponse.json(
                { error: 'ID invalide' },
                { status: 400 }
            );
        }

        const body = await req.json();
        const { title, content, type } = body;

        // Validate required fields
        if (!title?.trim() || !content?.trim()) {
            return NextResponse.json(
                { error: 'Le titre et le contenu sont requis' },
                { status: 400 }
            );
        }

        // Validate news type
        if (type && !Object.keys(newsTypeLabels).includes(type)) {
            return NextResponse.json(
                { error: 'Type d\'actualité invalide' },
                { status: 400 }
            );
        }

        // Check if article exists
        const existingArticle = await prisma.news.findUnique({
            where: { id }
        });

        if (!existingArticle) {
            return NextResponse.json(
                { error: 'Article non trouvé' },
                { status: 404 }
            );
        }

        const updatedArticle = await prisma.news.update({
            where: { id },
            data: {
                title: title.trim(),
                content: content.trim(),
                type: (type as News['type']) || existingArticle.type,
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
            message: 'Article mis à jour avec succès',
            article: updatedArticle
        });
    } catch (error) {
        console.error('Error updating article:', error);
        return NextResponse.json(
            { error: 'Échec de la mise à jour de l\'article', details: error instanceof Error ? error.message : 'Erreur inconnue' },
            { status: 500 }
        );
    }
}

// DELETE: Delete a specific article by ID
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

    try {
        const { id: string_id } = await params;  // Correctly destructure 'id' and rename to string_id
        const id = parseInt(string_id, 10);

        if (isNaN(id)) {
            return NextResponse.json(
                { error: 'ID invalide' },
                { status: 400 }
            );
        }

        // Check if article exists
        const existingArticle = await prisma.news.findUnique({
            where: { id }
        });

        if (!existingArticle) {
            return NextResponse.json(
                { error: 'Article non trouvé' },
                { status: 404 }
            );
        }

        await prisma.news.delete({
            where: { id }
        });

        return NextResponse.json({
            message: 'Article supprimé avec succès'
        });
    } catch (error) {
        console.error('Error deleting article:', error);
        return NextResponse.json(
            { error: 'Échec de la suppression de l\'article', details: error instanceof Error ? error.message : 'Erreur inconnue' },
            { status: 500 }
        );
    }
}