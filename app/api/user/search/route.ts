// app/api/users/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';
        const role = searchParams.get('role'); // Optional: 'AVEUGLE', 'STAFF', 'ADMIN', 'user'

        if (query.length < 2) {
            return NextResponse.json([]);
        }

        const whereClause: Prisma.UserWhereInput = {
            OR: [
                {
                    name: {
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

        // Filter by role if specified
        // role is a String field in the User model (not an enum)
        if (role) {
            whereClause.role = role;
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
            },
            take: 20, // Limit results
            orderBy: [
                {
                    name: 'asc',
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