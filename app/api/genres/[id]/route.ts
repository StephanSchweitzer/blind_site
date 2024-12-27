// app/api/genres/[id]/route.ts
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const json = await request.json();
        const genre = await prisma.genre.update({
            where: { id: params.id },
            data: {
                name: json.name,
                description: json.description || null,
            },
        });
        return NextResponse.json(genre);
    } catch (error: any) {
        console.error('Server error updating genre:', error);
        return NextResponse.json(
            { error: 'Failed to update genre', details: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        await prisma.genre.delete({
            where: { id: params.id },
        });
        return NextResponse.json({ status: 'success' });
    } catch (error: any) {
        console.error('Server error deleting genre:', error);
        return NextResponse.json(
            { error: 'Failed to delete genre', details: error.message },
            { status: 500 }
        );
    }
}