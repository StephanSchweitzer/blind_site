import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/civilities — active civilities for the user form dropdown
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return NextResponse.json({ error: 'insufficient authorization' }, { status: 403 });
    }

    try {
        const civilities = await prisma.civility.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        return NextResponse.json(civilities);
    } catch (error) {
        console.error('Error fetching civilities:', error);
        return NextResponse.json({ error: 'Failed to fetch civilities' }, { status: 500 });
    }
}