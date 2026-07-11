import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { withSuperAdmin } from '@/lib/auth/guards';

const PATH = '/nous-rejoindre';

export async function GET() {
    try {
        const items = await prisma.membershipOption.findMany({ orderBy: { sortOrder: 'asc' } });
        return NextResponse.json(items);
    } catch (error) {
        console.error('Error fetching membership options:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

export const POST = withSuperAdmin(async (req) => {
    try {
        const b = await req.json();
        if (!b.iconKey || !b.title || !b.body) {
            return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
        }
        const last = await prisma.membershipOption.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
        const item = await prisma.membershipOption.create({
            data: {
                iconKey: b.iconKey,
                colorTheme: b.colorTheme || 'blue',
                title: b.title,
                body: b.body,
                highlightLabel: b.highlightLabel || null,
                highlightValue: b.highlightValue || null,
                bullets: b.bullets || null,
                ctaLabel: b.ctaLabel || null,
                ctaHref: b.ctaHref || null,
                sortOrder: (last?.sortOrder ?? -1) + 1,
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json(item, { status: 201 });
    } catch (error) {
        console.error('Error creating membership option:', error);
        return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
    }
});

export const PATCH = withSuperAdmin(async (req) => {
    try {
        const { items } = await req.json();
        if (!Array.isArray(items)) {
            return NextResponse.json({ error: 'items[] requis' }, { status: 400 });
        }
        await prisma.$transaction(
            items.map((it: { id: number; sortOrder: number }) =>
                prisma.membershipOption.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } }),
            ),
        );
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error reordering membership options:', error);
        return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
    }
});
