import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';

type Params = { params: Promise<{ id: string }> };
const PATH = '/nous-rejoindre';

export async function PUT(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id } = await params;
        const b = await req.json();
        const item = await prisma.membershipOption.update({
            where: { id: parseInt(id, 10) },
            data: {
                ...(b.iconKey !== undefined && { iconKey: b.iconKey }),
                ...(b.colorTheme !== undefined && { colorTheme: b.colorTheme }),
                ...(b.title !== undefined && { title: b.title }),
                ...(b.body !== undefined && { body: b.body }),
                ...(b.highlightLabel !== undefined && { highlightLabel: b.highlightLabel || null }),
                ...(b.highlightValue !== undefined && { highlightValue: b.highlightValue || null }),
                ...(b.bullets !== undefined && { bullets: b.bullets || null }),
                ...(b.ctaLabel !== undefined && { ctaLabel: b.ctaLabel || null }),
                ...(b.ctaHref !== undefined && { ctaHref: b.ctaHref || null }),
                ...(b.active !== undefined && { active: b.active }),
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json(item);
    } catch (error) {
        console.error('Error updating membership option:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const { id } = await params;
        await prisma.membershipOption.delete({ where: { id: parseInt(id, 10) } });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.nousRejoindre, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting membership option:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
