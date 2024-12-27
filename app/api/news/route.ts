import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
    // 1. Session retrieval
    let session;
    try {
        session = await getServerSession(authOptions);
        console.log("Session retrieved:", session);
    } catch (error) {
        console.error("Session retrieval failed:", error);
        return NextResponse.json(
            { error: 'Authentication error' },
            { status: 500 }
        );
    }

    // 2. Session validation
    if (!session?.user?.id) {
        console.log("Invalid session:", session);
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // 3. Request body parsing
    let title, content;
    try {
        const body = await req.json();
        ({ title, content } = body);
    } catch (error) {
        console.error("Request parsing failed:", error);
        return NextResponse.json(
            { error: 'Invalid request format' },
            { status: 400 }
        );
    }

    // 4. Input validation
    if (!title || !content) {
        console.log("Missing required fields - Title:", title, "Content:", content);
        return NextResponse.json(
            { error: 'Title and content are required' },
            { status: 400 }
        );
    }

    // 5. Author ID parsing
    let parsedAuthorId;
    try {
        parsedAuthorId = parseInt(session.user.id, 10);
        if (isNaN(parsedAuthorId)) {
            throw new Error('Invalid author ID format');
        }
    } catch (error) {
        console.error("Author ID parsing failed:", error);
        return NextResponse.json(
            { error: 'Invalid author ID' },
            { status: 400 }
        );
    }

    // 6. Database operation
    try {
        const newArticle = await prisma.news.create({
            data: {
                title,
                content,
                authorId: parsedAuthorId,
                publishedAt: new Date(),
            },
        });
        console.log("Article created:", newArticle);

        return NextResponse.json(
            { message: 'Article created successfully', article: newArticle },
            { status: 201 }
        );
    } catch (error) {
        console.error("Database operation failed:", error);
        return NextResponse.json(
            { error: 'Database operation failed' },
            { status: 500 }
        );
    }
}