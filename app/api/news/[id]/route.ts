import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
    }>;
}


// GET: Fetch a specific article by ID
export async function GET(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const article = await prisma.news.findUnique({
            where: { id: parseInt(id, 10) },
        });

        if (!article) {
            return NextResponse.json({ error: 'Article not found' }, { status: 404 });
        }

        return NextResponse.json(article);
    } catch (error) {
        console.error('Failed to fetch article:', error);
        return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
    }
}

// PUT: Update a specific article by ID
export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        const { title, content } = await req.json();

        if (!title || !content) {
            return NextResponse.json(
                { error: 'Title and content are required' },
                { status: 400 }
            );
        }

        const updatedArticle = await prisma.news.update({
            where: { id: parseInt(id, 10) },
            data: { title, content },
        });

        return NextResponse.json({
            message: 'Article updated successfully',
            article: updatedArticle,
        });
    } catch (error) {
        console.error('Failed to update article:', error);
        return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
    }
}

// DELETE: Delete a specific article by ID
export async function DELETE(req: NextRequest, { params }: Params) {
    const { id } = await params;

    try {
        await prisma.news.delete({
            where: { id: parseInt(id, 10) },
        });

        return NextResponse.json({ message: 'Article deleted successfully' });
    } catch (error) {
        console.error('Failed to delete article:', error);
        return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 });
    }
}
