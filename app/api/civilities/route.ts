import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

// GET /api/civilities — active civilities for the user form dropdown
export const GET = withAdmin(async () => {
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
});