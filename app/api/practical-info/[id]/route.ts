import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';

type Params = { params: Promise<{ id: string }> };
const PATH = '/nous-connaitre/informations-pratiques';

export async function PUT(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    try {
        const { id } = await params;
        const { iconKey, colorTheme, question, body, active } = await req.json();
        const item = await prisma.practicalInfo.update({
            where: { id: parseInt(id, 10) },
            data: {
                ...(iconKey !== undefined && { iconKey }),
                ...(colorTheme !== undefined && { colorTheme }),
                ...(question !== undefined && { question }),
                ...(body !== undefined && { body }),
                ...(active !== undefined && { active }),
            },
        });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json(item);
    } catch (error) {
        console.error('Error updating practical info:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (session?.user.accessLevel !== 'super_admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    try {
        const { id } = await params;
        await prisma.practicalInfo.delete({ where: { id: parseInt(id, 10) } });
        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.informationsPratiques, PATH);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting practical info:', error);
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
