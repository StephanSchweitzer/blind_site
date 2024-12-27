// app/api/genres/[id]/route.ts
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json();

        if (!body?.name) {
            return NextResponse.json(
                { error: 'Name is required' },
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                    }
                }
            );
        }

        const genre = await prisma.genre.update({
            where: {
                id: parseInt(params.id, 10)
            },
            data: {
                name: body.name,
                description: body.description || null
            }
        });

        return NextResponse.json(
            { data: genre },
            {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store',
                }
            }
        );
    } catch (error) {
        console.error('Error updating genre:', error);
        return NextResponse.json(
            { error: 'Failed to update genre' },
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                }
            }
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