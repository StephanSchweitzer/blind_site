// app/api/books/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
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
        // Replace with actual user ID from session
        const addedById = 1; // Placeholder

        const newBook = await prisma.book.create({
            data: {
                title,
                author,
                publishedDate: new Date(publishedDate),
                genre,
                isbn,
                description,
                available,
                addedById,
            },
        });
        return NextResponse.json({ message: 'Book added successfully', book: newBook }, { status: 201 });
    } catch (error) {
        console.error('Failed to add book:', error);
        return NextResponse.json({ error: 'Failed to add book' }, { status: 400 });
    }
}
