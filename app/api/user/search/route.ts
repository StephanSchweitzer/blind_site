import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getActiveAssignmentCounts } from '@/lib/users/deletionGuard';
import { Prisma } from '@prisma/client';
import { MemberType, AccessLevel, UserActivityStatus } from '@prisma/client';


export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);

    if (!session) {
        return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
        });
    }

    if (session?.user.accessLevel !== 'admin' && session?.user.accessLevel !== 'super_admin') {
        return new NextResponse(JSON.stringify({ error: "insufficient authorization" }), {
            status: 403,
        });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';
        const memberType = searchParams.get('memberType');
        const accessLevel = searchParams.get('accessLevel');
        // When set, restrict to members who can currently receive assignments.
        const assignable = searchParams.get('assignable') === 'true';

        if (query.length < 2) {
            return NextResponse.json([]);
        }

        const whereClause: Prisma.UserWhereInput = {
            // Exclude soft-deleted users. The global Prisma extension also does
            // this for findMany; set explicitly here so the picker stays clean
            // even if the query path changes.
            deletedAt: null,
            OR: [
                { firstName: { contains: query, mode: Prisma.QueryMode.insensitive } },
                { lastName:  { contains: query, mode: Prisma.QueryMode.insensitive } },
                { email:     { contains: query, mode: Prisma.QueryMode.insensitive } },
            ],
        };

        if (memberType) {
            whereClause.memberType = memberType as MemberType;
        }

        if (accessLevel) {
            whereClause.accessLevel = accessLevel as AccessLevel;
        }

        if (assignable) {
            // A reader is assignable only if their membership is ACTIVE and they
            // haven't been marked unavailable. (isAvailable is nullable; treat
            // null as available, exclude only explicit false.)
            whereClause.activityStatus = UserActivityStatus.ACTIVE;
            whereClause.isAvailable = { not: false };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                memberType: true,
                accessLevel: true,
                civility: { select: { name: true } },
                // #3 — needed to compare against the active-assignment count.
                maxConcurrentAssignments: true,
            },
            take: 20,
            orderBy: [
                { firstName: 'asc' },
                { lastName: 'asc' },
                { email: 'asc' },
            ],
        });

        // #5 — dedupe legacy Access-migration duplicates by normalized email.
        // Two rows can share the same person (e.g. an UPPERCASE-email legacy row
        // beside the clean one). Keep the "best" row: prefer civility set, then a
        // complete first+last name, then a lowercase-stored (clean) email. Rows
        // without an email can't be safely deduped, so they're kept as-is.
        const scoreUser = (u: (typeof users)[number]): number => {
            let s = 0;
            if (u.civility?.name) s += 4;
            if (u.firstName && u.lastName) s += 2;
            if (u.email && u.email === u.email.toLowerCase()) s += 1;
            return s;
        };
        const byEmail = new Map<string, (typeof users)[number]>();
        const noEmail: typeof users = [];
        for (const u of users) {
            const key = u.email ? u.email.trim().toLowerCase() : null;
            if (!key) {
                noEmail.push(u);
                continue;
            }
            const existing = byEmail.get(key);
            if (!existing || scoreUser(u) > scoreUser(existing)) {
                byEmail.set(key, u);
            }
        }
        const deduped = [...byEmail.values(), ...noEmail];

        // #3 — when filtering assignable readers, attach each one's current
        // active-assignment count so the form can warn at the max. Reuses the
        // shared latest-reader logic from deletionGuard (batched for the page).
        if (assignable) {
            const counts = await getActiveAssignmentCounts(deduped.map((u) => u.id));
            const withCounts = deduped.map((u) => ({
                ...u,
                activeAssignmentCount: counts.get(u.id) ?? 0,
            }));
            return NextResponse.json(withCounts);
        }

        return NextResponse.json(deduped);
    } catch (error) {
        console.error('Error searching users:', error);
        return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
    }
}