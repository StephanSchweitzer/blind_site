import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { withSuperAdmin } from '@/lib/auth/guards';

const PATH = '/nous-connaitre/historique';

export const PUT = withSuperAdmin(async (req, { params }) => {
    try {
        const { id } = await params!;
        const { year, title, description, iconKey } = await req.json();
        const data: { year?: number; title?: string; description?: string; iconKey?: string } = {};
        if (year !== undefined) {
            const parsedYear = parseInt(year, 10);
            if (!Number.isInteger(parsedYear)) {
                return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
            }
            data.year = parsedYear;
        }
        if (title !== undefined) data.title = title;
        if (description !== undefined) data.description = description;
        if (iconKey !== undefined) data.iconKey = iconKey;

        const event = await prisma.historyEvent.update({ where: { id: parseInt(id, 10) }, data });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.historique, PATH);
        return NextResponse.json(event);
    } catch (error) {
        console.error('Error updating history event:', error);
        return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }
});

export const DELETE = withSuperAdmin(async (_req, { params }) => {
    try {
        const { id } = await params!;
        await prisma.historyEvent.delete({ where: { id: parseInt(id, 10) } });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.historique, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting history event:', error);
        return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }
});
