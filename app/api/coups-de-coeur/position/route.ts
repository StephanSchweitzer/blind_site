import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        // Get the ID from the URL
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id || isNaN(Number(id))) {
            return NextResponse.json(
                { error: 'Invalid ID parameter' },
                { status: 400 }
            );
        }

        // Find all coups de coeur IDs ordered by your preferred sort
        const allIds = await prisma.coupsDeCoeur.findMany({
            select: { id: true },
            orderBy: { createdAt: 'desc' }, // Adjust ordering as needed
        });

        // Find the position of the requested ID
        const position = allIds.findIndex(item => item.id === Number(id));

        if (position === -1) {
            return NextResponse.json(
                { error: 'Coup de coeur not found' },
                { status: 404 }
            );
        }

        // Calculate the page number (assuming 1 item per page)
        const page = position + 1;

        return NextResponse.json({ page });
    } catch (error) {
        console.error('Error getting coup de coeur position:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}