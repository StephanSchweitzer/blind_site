import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';

const PATH = '/nous-connaitre/informations-pratiques';

export async function GET() {
    try {
        const items = await prisma.practicalInfo.findMany({ orderBy: { sortOrder: 'asc' } });
        return NextResponse.json(items);
    } catch (error) {
        console.error('Error fetching practical info:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { iconKey, colorTheme, question, body } = await req.json();
        if (!iconKey || !question || !body) {
            return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
        }
        const last = await prisma.practicalInfo.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
        const item = await prisma.practicalInfo.create({
            data: {
                iconKey,
                colorTheme: colorTheme || 'blue',
                question,
                body,
                sortOrder: (last?.sortOrder ?? -1) + 1,
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        console.error('Error creating practical info:', error);
        return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { items } = await req.json();
        if (!Array.isArray(items)) {
            return NextResponse.json({ error: 'items[] requis' }, { status: 400 });
        }
        await prisma.$transaction(
            items.map((it: { id: number; sortOrder: number }) =>
                prisma.practicalInfo.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } }),
            ),
        );
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error reordering practical info:', error);
        return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
    }
}
