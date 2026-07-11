import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';

// Returns existing users that share the given first + last name (case-insensitive)
// so the create form can warn about a possible duplicate. This is a soft warning,
// not a block — real people legitimately share names.
export const GET = withAdmin(async (request) => {
    const firstName = request.nextUrl.searchParams.get('firstName')?.trim();
    const lastName = request.nextUrl.searchParams.get('lastName')?.trim();

    if (!firstName || !lastName) {
        return NextResponse.json({ matches: [] });
    }

    try {
        const matches = await prisma.user.findMany({
            where: {
                firstName: { equals: firstName, mode: 'insensitive' },
                lastName: { equals: lastName, mode: 'insensitive' },
            },
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
            },
            take: 10,
        });

        return NextResponse.json({ matches });
    } catch (error) {
        console.error('check-duplicate error:', error);
        return NextResponse.json({ message: 'Failed to check duplicates' }, { status: 500 });
    }
});