import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, TeamSection } from '@prisma/client';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { revalidatePublic } from '@/lib/revalidate-public';
import { CACHE_TAGS } from '@/lib/cache-tags';
import { withSuperAdmin } from '@/lib/auth/guards';

const SECTIONS: TeamSection[] = ['DIRECTION', 'CONSEIL', 'PERMANENCE'];

export async function GET() {
    try {
        const members = await prisma.teamMember.findMany({
            orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        });
        return NextResponse.json(members);
    } catch (error) {
        console.error('Error fetching team members:', error);
        return NextResponse.json({ error: 'Failed to fetch team' }, { status: 500 });
    }
}

export const POST = withSuperAdmin(async (req) => {
    try {
        const { name, role, section } = await req.json();

        if (!name || !SECTIONS.includes(section)) {
            return NextResponse.json({ error: 'Nom et section valides requis' }, { status: 400 });
        }

        const last = await prisma.teamMember.findFirst({
            where: { section },
            orderBy: { sortOrder: 'desc' },
            select: { sortOrder: true },
        });

        const member = await prisma.teamMember.create({
            data: {
                name,
                role: role || null,
                section,
                sortOrder: (last?.sortOrder ?? -1) + 1,
            },
        });

        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.team, '/nous-connaitre/equipe');

        return NextResponse.json(member, { status: 201 });
    } catch (error) {
        console.error('Error creating team member:', error);
        return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
    }
});

// Batch reorder: body { items: [{ id, sortOrder }] }
export const PATCH = withSuperAdmin(async (req) => {
    try {
        const { items } = await req.json();
        if (!Array.isArray(items)) {
            return NextResponse.json({ error: 'items[] requis' }, { status: 400 });
        }

        await prisma.$transaction(
            items.map((it: { id: number; sortOrder: number }) =>
                prisma.teamMember.update({
                    where: { id: it.id },
                    data: { sortOrder: it.sortOrder },
                }),
            ),
        );

        revalidateAdmin();
        revalidatePublic(CACHE_TAGS.team, '/nous-connaitre/equipe');

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('Prisma error reordering team:', error.code);
        } else {
            console.error('Error reordering team:', error);
        }
        return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
    }
});
