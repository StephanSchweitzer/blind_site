import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Returns existing users that share the given first + last name (case-insensitive)
// so the create form can warn about a possible duplicate. This is a soft warning,
// not a block — real people legitimately share names.
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

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
}