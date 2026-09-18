// app/api/news/route.ts
import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { prisma } from '@/lib/prisma';
import { listPublicNews, parsePublicNewsQuery } from '@/lib/news/newsList';
import { NextRequest } from 'next/server';
import { News } from '@prisma/client';
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
        // Same engine as the back-office list, in its public form: titles,
        // contents, types and the author's DISPLAYED name only, and an explicit
        // whitelist of returned fields. See listPublicNews.
        const { searchParams } = new URL(req.url);
        return NextResponse.json(await listPublicNews(parsePublicNewsQuery((key) => searchParams.get(key))));
    } catch (error) {
        console.error('Error fetching news:', error);
        // No `details`: this route is public, and an exception message can carry
        // database internals.
        return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
    }
}
