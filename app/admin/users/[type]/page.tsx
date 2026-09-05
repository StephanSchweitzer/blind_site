import { prisma } from '@/lib/prisma';
import { Prisma, Language } from '@prisma/client';
import UsersTable from './users-table';
import { notFound } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { UserTypeTabs } from './user-type-tabs';
import { UserType, USER_TYPE_VALUES, isUserType } from '@/lib/user-enums';
import { activityStatusFilterWhere, effectivelyActiveWhere } from '@/lib/users/activityStatus';
import { LANGUAGE_VALUES } from '@/lib/user-enums';
import { cotisationCoverageQuery } from '@/lib/cotisation';
import { parsePageParam, pageSkip } from '@/lib/pagination';

interface PageProps {
    params: Promise<{ type: string }>;
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function generateStaticParams() {
    return USER_TYPE_VALUES.map((type) => ({ type }));
}

async function getUsers(
    page: number,
    searchTerm: string,
    userType: UserType,
    statusFilter: string,
    languageFilter: string,
    cotisationFilter: string
) {
    const usersPerPage = 10;

    // Base filter: member type + free-text search. Status filter is applied
    // separately so the active/inactive counts always reflect the full set.
    const baseWhere: Prisma.UserWhereInput =
        userType === 'auditeurs'  ? { memberType: 'auditeur' } :
            userType === 'lecteurs'   ? { memberType: 'lecteur' } :
                userType === 'bienfaiteurs' ? { memberType: 'bienfaiteur' } :
                    { accessLevel: { in: ['admin', 'super_admin'] } };

    if (searchTerm) {
        // Split on whitespace so "Leila Be" matches firstName="Leila" + lastName="Bennour".
        // Each token must match at least one field (AND across tokens, OR across fields),
        // which also makes the order irrelevant ("Bennour Leila" works too).
        const tokens = searchTerm.trim().split(/\s+/).filter(Boolean);

        if (tokens.length > 0) {
            baseWhere.AND = tokens.map((token) => ({
                OR: [
                    { firstName: { contains: token, mode: Prisma.QueryMode.insensitive } },
                    { lastName:  { contains: token, mode: Prisma.QueryMode.insensitive } },
                    { email:     { contains: token, mode: Prisma.QueryMode.insensitive } },
                ],
            }));
        }
    }

    // "Scoped" population: base + search + language + cotisation, but NOT the
    // activity-status filter. The actifs/inactifs breakdown is computed over this
    // set so the two counts always reflect the current filters AND always sum to
    // the scoped total (active + inactive partitions it exactly).
    const scopedWhere: Prisma.UserWhereInput = { ...baseWhere };

    if (languageFilter && (LANGUAGE_VALUES as readonly string[]).includes(languageFilter)) {
        scopedWhere.languages = { some: { language: languageFilter as Language } };
    }

    // Cotisation filter: "à jour" = has an active cotisation still in coverage;
    // "en retard" = none (covers both lapsed cotisations and no cotisation at all).
    // Mirrors lib/cotisation.ts computeCotisationStatus: calendar-year coverage via
    // cotisationYear, with the legacy rolling rule for rows that predate it.
    if (cotisationFilter === 'a_jour' || cotisationFilter === 'en_retard') {
        const { currentYear, legacyCutoff } = cotisationCoverageQuery();
        const cotisationMatch: Prisma.PaymentWhereInput = {
            type: 'COTISATION',
            isActive: true,
            OR: [
                // Calendar-year: covers the current year or a prepaid future year.
                { cotisationYear: { gte: currentYear } },
                // Legacy rows without a cotisationYear: rolling 12 months.
                {
                    AND: [
                        { cotisationYear: null },
                        {
                            OR: [
                                { paymentDate: { gte: legacyCutoff } },
                                { AND: [{ paymentDate: null }, { creationDate: { gte: legacyCutoff } }] },
                            ],
                        },
                    ],
                },
            ],
        };
        scopedWhere.payments =
            cotisationFilter === 'a_jour' ? { some: cotisationMatch } : { none: cotisationMatch };
    }

    // The list adds the activity-status filter on top of the scoped population.
    // The filter matches the EFFECTIVE status (an unavailability whose window
    // is not in force reads as Actif), so it is a `where` fragment, not a plain
    // column comparison — wrapped in AND so it can't collide with the search's
    // own AND on scopedWhere.
    const statusWhere = activityStatusFilterWhere(statusFilter);
    const listWhere: Prisma.UserWhereInput = statusWhere
        ? { AND: [scopedWhere, statusWhere] }
        : scopedWhere;
    const activeWhere: Prisma.UserWhereInput = { AND: [scopedWhere, effectivelyActiveWhere()] };
    const inactiveWhere: Prisma.UserWhereInput = {
        AND: [scopedWhere, { NOT: effectivelyActiveWhere() }],
    };

    try {
        const [users, totalUsers, activeCount, inactiveCount] = await Promise.all([
            prisma.user.findMany({
                where: listWhere,
                orderBy: { id: 'desc' },
                skip: pageSkip(page, usersPerPage),
                take: usersPerPage,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    memberType: true,
                    accessLevel: true,
                    activityStatus: true,
                    unavailableFrom: true,
                    unavailableUntil: true,
                    lastUpdated: true,
                    civility: { select: { name: true } },
                },
            }),
            prisma.user.count({ where: listWhere }),
            prisma.user.count({ where: activeWhere }),
            prisma.user.count({ where: inactiveWhere }),
        ]);

        return {
            users,
            totalUsers,
            // Scoped total = actifs + inactifs (they partition the scoped set), so
            // the summary line is always internally consistent.
            scopedTotal: activeCount + inactiveCount,
            activeCount,
            inactiveCount,
            totalPages: Math.ceil(totalUsers / usersPerPage),
        };
    } catch (error) {
        console.error('Error fetching users:', error);
        throw new Error('Failed to fetch users');
    }
}

export default async function UsersPage({ params, searchParams }: PageProps) {
    const me = await getCurrentUser();

    if (!me) {
        redirect('/login');
    }

    if (!isAdmin(me.accessLevel)) {
        redirect('/');
    }

    const resolvedParams = await params;
    const userType = resolvedParams.type;

    if (!isUserType(userType)) {
        notFound();
    }

    const searchParamsResolved = await searchParams;

    const page = parsePageParam(searchParamsResolved.page);
    const searchTerm = Array.isArray(searchParamsResolved.search)
        ? searchParamsResolved.search[0]
        : searchParamsResolved.search || '';
    const statusFilter = Array.isArray(searchParamsResolved.status)
        ? searchParamsResolved.status[0]
        : searchParamsResolved.status || '';
    const languageFilter = Array.isArray(searchParamsResolved.language)
        ? searchParamsResolved.language[0]
        : searchParamsResolved.language || '';
    const cotisationFilter = Array.isArray(searchParamsResolved.cotisation)
        ? searchParamsResolved.cotisation[0]
        : searchParamsResolved.cotisation || '';

    // Only the data fetch is guarded. JSX is returned at the top level so render
    // errors propagate to an error boundary instead of being silently swallowed.
    let data: Awaited<ReturnType<typeof getUsers>>;
    try {
        data = await getUsers(page, searchTerm, userType, statusFilter, languageFilter, cotisationFilter);
    } catch (error) {
        console.error('Error in Users page:', error);
        notFound();
    }

    const { users, totalUsers, scopedTotal, totalPages, activeCount, inactiveCount } = data;

    const serializedUsers = users.map(user => ({
        ...user,
        lastUpdated: user.lastUpdated ? user.lastUpdated.toISOString() : null,
    }));

    return (
        <div className="space-y-6">
            <UserTypeTabs currentType={userType} />

            <UsersTable
                type={userType}
                initialUsers={serializedUsers}
                initialPage={page}
                initialSearch={searchTerm}
                initialStatus={statusFilter}
                initialLanguage={languageFilter}
                initialCotisation={cotisationFilter}
                totalPages={totalPages}
                initialTotalUsers={totalUsers}
                scopedTotal={scopedTotal}
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                currentUserAccessLevel={me.accessLevel}
            />
        </div>
    );
}