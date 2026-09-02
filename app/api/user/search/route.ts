import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActiveAssignmentCounts } from '@/lib/users/deletionGuard';
import { Prisma } from '@prisma/client';
import { MemberType, AccessLevel } from '@prisma/client';
import { withAdmin } from '@/lib/auth/guards';
import { meetsSearchMinLength, normalizeSearchQuery, parseEntityId } from '@/lib/search-query';


export const GET = withAdmin(async (request) => {
    try {
        const searchParams = request.nextUrl.searchParams;
        // Normalized here as well as in the picker: this route is also hit
        // directly, and « #42 » must resolve to person 42 either way.
        const query = normalizeSearchQuery(searchParams.get('q') || '');
        const memberType = searchParams.get('memberType');
        const accessLevel = searchParams.get('accessLevel');
        // When set, restrict to members who can currently receive assignments.
        const assignable = searchParams.get('assignable') === 'true';

        // A bare id is searchable at one character — see meetsSearchMinLength.
        if (!meetsSearchMinLength(query, 2)) {
            return NextResponse.json([]);
        }

        // Split on whitespace so multi-word queries ("stephan s") match across
        // fields: every term must hit at least one field (AND of ORs). This lets
        // "stephan" match firstName while "s" matches lastName.
        const terms = query.trim().split(/\s+/).filter(Boolean);

        const nameMatch: Prisma.UserWhereInput = {
            AND: terms.map((term) => ({
                OR: [
                    { firstName: { contains: term, mode: Prisma.QueryMode.insensitive } },
                    { lastName:  { contains: term, mode: Prisma.QueryMode.insensitive } },
                    { email:     { contains: term, mode: Prisma.QueryMode.insensitive } },
                ],
            })),
        };

        // Staff look people up by the id shown in « Modifier la personne #42 ».
        // OR-ed with the name search rather than replacing it: an all-digit
        // query can also be part of an email or a legacy imported name, and
        // silently dropping those matches would be worse than a longer list.
        const entityId = parseEntityId(query);

        const whereClause: Prisma.UserWhereInput = {
            // Exclude soft-deleted users. The global Prisma extension also does
            // this for findMany; set explicitly here so the picker stays clean
            // even if the query path changes.
            deletedAt: null,
            ...(entityId !== null
                ? { OR: [{ id: entityId }, nameMatch] }
                : nameMatch),
        };

        if (memberType) {
            whereClause.memberType = memberType as MemberType;
        }

        if (accessLevel) {
            whereClause.accessLevel = accessLevel as AccessLevel;
        }

        if (assignable) {
            // Inactive readers are intentionally NOT filtered out here anymore:
            // hiding them from search made an inactive lecteur impossible to find
            // (and impossible to reactivate from this form). They still show up,
            // and selecting one triggers the activity guard (useUserActivityGuard /
            // UserActivityGuardDialog) so the admin gets the same "reactivate or
            // cancel" prompt the order form shows for an inactive auditeur, instead
            // of silently vanishing from the list.
            // `isAvailable` is a separate, unrelated flag (an active reader who's
            // temporarily marked unavailable) and is still excluded.
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
                // Carried so forms can pre-fill demande/attribution defaults from
                // the selected person's profile without an extra round-trip.
                preferredMediaFormatId: true,
                preferredDeliveryMethod: true,
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
        let deduped = [...byEmail.values(), ...noEmail];

        // An explicit id match must survive the dedupe and lead the list. Two
        // legacy rows can share an email, and the scoring above would happily
        // discard the very row the admin pasted the id of — handing them a
        // different person under the number they typed. Asking for an id is
        // unambiguous in a way a name search never is, so it wins outright.
        if (entityId !== null) {
            const exact = users.find((u) => u.id === entityId);
            if (exact) {
                deduped = [exact, ...deduped.filter((u) => u.id !== entityId)];
            }
        }

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
});