import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TeamSection } from '@prisma/client';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';

type Params = { params: Promise<{ id: string }> };

const SECTIONS: TeamSection[] = ['DIRECTION', 'CONSEIL', 'PERMANENCE'];

export async function PUT(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        const { name, role, section, active } = await req.json();

        if (section !== undefined && !SECTIONS.includes(section)) {
            return NextResponse.json({ error: 'Section invalide' }, { status: 400 });
        }

        const member = await prisma.teamMember.update({
            where: { id: parseInt(id, 10) },
            data: {
                ...(name !== undefined && { name }),
                ...(role !== undefined && { role: role || null }),
                ...(section !== undefined && { section }),
                ...(active !== undefined && { active }),
            },
        });

        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.team, '/nous-connaitre/equipe');

        return NextResponse.json(member);
    } catch (error) {
        console.error('Error updating team member:', error);
        return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        await prisma.teamMember.delete({ where: { id: parseInt(id, 10) } });

        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.team, '/nous-connaitre/equipe');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting team member:', error);
        return NextResponse.json({ error: 'Failed to delete member' }, { status: 500 });
    }
}
