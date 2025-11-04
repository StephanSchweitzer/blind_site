import { getServerSession } from "next-auth";
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
        });
    }

    if (session?.user.role !== 'admin' && session?.user.role !== 'super_admin') {
        return new NextResponse(JSON.stringify({ error: "insufficient authorization" }), {
            status: 403,
        });
    }

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                lastUpdated: true,
            },
            orderBy: {
                id: 'desc',
            },
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}