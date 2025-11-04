import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
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
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';
        const role = searchParams.get('role');

        if (query.length < 2) {
            return NextResponse.json([]);
        }

        const whereClause: Prisma.UserWhereInput = {
            OR: [
                {
                    firstName: {
                        contains: query,
                        mode: Prisma.QueryMode.insensitive,
                    },
                },
                {
                    lastName: {
                        contains: query,
                        mode: Prisma.QueryMode.insensitive,
                    },
                },
                {
                    email: {
                        contains: query,
                        mode: Prisma.QueryMode.insensitive,
                    },
                },
            ],
        };

        if (role) {
            whereClause.role = role;
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
            },
            take: 20,
            orderBy: [
                {
                    firstName: 'asc',
                },
                {
                    lastName: 'asc',
                },
                {
                    email: 'asc',
                },
            ],
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error('Error searching users:', error);
        return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
}