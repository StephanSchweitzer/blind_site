// app/api/books/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

interface Params {
    params: {
        id: string;
    };
}

export async function GET(req: NextRequest, { params }: Params) {
    const { id } = params;

    try {
        const book = await prisma.book.findUnique({
            where: { id: parseInt(id, 10) },
        });
        if (!book) {
            return NextResponse.json({ error: 'Book not found' }, { status: 404 });
        }
        return NextResponse.json(book);
    } catch (error) {
        console.error('Failed to fetch book:', error);
        return NextResponse.json({ error: 'Failed to fetch book' }, { status: 400 });
    }
}

export async function PUT(req: NextRequest, { params }: Params) {
    const { id } = params;
    const {
        title,
        author,
        publishedDate,
        genre,
        isbn,
        description,
        available,
    } = await req.json();

    try {
        await prisma.book.update({
            where: { id: parseInt(id, 10) },
            data: {
                title,
                author,
                publishedDate: new Date(publishedDate),
                genre,
                isbn,
                description,
                available,
            },
        });
        return NextResponse.json({ message: 'Book updated successfully' });
    } catch (error) {
        console.error('Failed to update book:', error);
        return NextResponse.json({ error: 'Failed to update book' }, { status: 400 });
    }
}
