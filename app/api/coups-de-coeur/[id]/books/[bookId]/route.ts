import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
        bookId: string;
    }>;
}

export async function GET(req: NextRequest, { params }: Params) {
    const { id, bookId } = await params;

    try {
        const relation = await prisma.coupsDeCoeurBooks.findUnique({
            where: {
                coupsDeCoeurId_bookId: {
                    coupsDeCoeurId: parseInt(id, 10),
                    bookId: parseInt(bookId, 10)
                }
            }
        });

        if (!relation) {
            return NextResponse.json({ error: 'Relation not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: relation });
    } catch (error) {
        console.error('Failed to check book in coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to check book' }, { status: 500 });
    }
}

export async function POST(req: NextRequest, { params }: Params) {
    const { id, bookId } = await params;

    try {
        const newRelation = await prisma.coupsDeCoeurBooks.create({
            data: {
                coupsDeCoeurId: parseInt(id, 10),
                bookId: parseInt(bookId, 10)
            }
        });

        return NextResponse.json({ success: true, data: newRelation });
    } catch (error) {
        console.error('Failed to add book to coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to add book' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: Params) {
    const { id, bookId } = await params;

    try {
        await prisma.coupsDeCoeurBooks.delete({
            where: {
                coupsDeCoeurId_bookId: {
                    coupsDeCoeurId: parseInt(id, 10),
                    bookId: parseInt(bookId, 10)
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to remove book from coup de coeur:', error);
        return NextResponse.json({ error: 'Failed to remove book' }, { status: 500 });
    }
}