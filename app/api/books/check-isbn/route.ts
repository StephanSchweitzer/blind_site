import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

// Tells the book search whether an ISBN is already catalogued, so importing a
// Google Books result can be refused up front. Mirrors the duplicate-ISBN check
// in POST /api/books, which stays the authoritative guard.
export const GET = withAdmin(async (request) => {
    const isbn = request.nextUrl.searchParams.get('isbn')?.trim();

    if (!isbn) {
        return NextResponse.json({ exists: false });
    }

    try {
        const existingBook = await prisma.book.findFirst({
            where: {
                isbn: {
                    equals: isbn,
                    mode: 'insensitive'
                }
            },
            select: { id: true },
        });

        return NextResponse.json({ exists: existingBook !== null });
    } catch (error) {
        console.error('check-isbn error:', error);
        return NextResponse.json({ message: 'Failed to check ISBN' }, { status: 500 });
    }
});
