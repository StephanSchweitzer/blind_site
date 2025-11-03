import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const mediaFormats = await prisma.mediaFormat.findMany({
            select: {
                id: true,
                name: true,
                description: true,
            },
            orderBy: {
                name: 'asc',
            },
        });

        return NextResponse.json(mediaFormats);
    } catch (error) {
        console.error('Error fetching media formats:', error);
        return NextResponse.json({ error: 'Failed to fetch media formats' }, { status: 500 });
    }
}