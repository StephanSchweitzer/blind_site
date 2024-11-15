import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth'; // Path to your NextAuth configuration

export async function POST(req: NextRequest) {
    try {
        // Retrieve the session to get the author ID
        const session = await getServerSession(authOptions);

        if (!session || !session.user || !session.user.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const authorId = session.user.id; // Use the ID from the session token

        const { title, content } = await req.json();

        // Validate required fields
        if (!title || !content) {
            return NextResponse.json(
                { error: 'Title and content are required' },
                { status: 400 }
            );
        }

        const newArticle = await prisma.news.create({
            data: {
                title,
                content,
                authorId: parseInt(authorId, 10),
                publishedAt: new Date(),
            },
        });

        return NextResponse.json(
            { message: 'Article created successfully', article: newArticle },
            { status: 201 }
        );
    } catch (error) {
        console.error('Failed to create article:', error);
        return NextResponse.json({ error: 'Failed to create article' }, { status: 500 });
    }
}
