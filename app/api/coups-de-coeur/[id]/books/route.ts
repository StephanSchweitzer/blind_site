// api/coups-de-coeur/[id]/books/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: Promise<{
        id: string;
    }>;
}


export async function POST(req: NextRequest, { params }: Params) {
    const { id } = await params;
    const { bookId } = await req.json();

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
    const { id } = await params;
    const { bookId } = await req.json();

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