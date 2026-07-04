import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';

const PATH = '/nous-connaitre/historique';

export async function GET() {
    try {
        const events = await prisma.historyEvent.findMany({ orderBy: { year: 'asc' } });
        return NextResponse.json(events);
    } catch (error) {
        console.error('Error fetching history:', error);
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { year, title, description, iconKey } = await req.json();
        const parsedYear = parseInt(year, 10);
        if (!Number.isInteger(parsedYear) || !title || !description || !iconKey) {
            return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
        }
        const event = await prisma.historyEvent.create({
            data: { year: parsedYear, title, description, iconKey },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.historique, PATH);
        return NextResponse.json(event, { status: 201 });
    } catch (error) {
        console.error('Error creating history event:', error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
}
