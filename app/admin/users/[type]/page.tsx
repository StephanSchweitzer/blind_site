import { prisma } from '@/lib/prisma';
import { Prisma, UserActivityStatus } from '@prisma/client';
import UsersTable from './users-table';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { UserTypeTabs } from './user-type-tabs';
import { UserType, USER_TYPE_VALUES, isUserType } from '@/lib/user-enums';
import { USER_ACTIVITY_STATUS_VALUES } from '@/lib/user-activity-enums';

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
    statusFilter: string
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

    // List filter adds the activity-status filter on top of the base.
    const listWhere: Prisma.UserWhereInput = { ...baseWhere };
    if (statusFilter === 'active') {
        listWhere.activityStatus = UserActivityStatus.ACTIVE;
    } else if (statusFilter === 'inactive') {
        listWhere.activityStatus = { not: UserActivityStatus.ACTIVE };
    } else if ((USER_ACTIVITY_STATUS_VALUES as readonly string[]).includes(statusFilter)) {
        listWhere.activityStatus = statusFilter as UserActivityStatus;
    }

    try {
        const [users, totalUsers, activeCount, inactiveCount] = await Promise.all([
            prisma.user.findMany({
                where: listWhere,
                orderBy: { id: 'desc' },
                skip: Math.max(0, (page - 1) * usersPerPage),
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
                    lastUpdated: true,
                    civility: { select: { name: true } },
                },
            }),
            prisma.user.count({ where: listWhere }),
            prisma.user.count({ where: { ...baseWhere, activityStatus: UserActivityStatus.ACTIVE } }),
            prisma.user.count({ where: { ...baseWhere, activityStatus: { not: UserActivityStatus.ACTIVE } } }),
        ]);

        return {
            users,
            totalUsers,
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
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login');
    }

    if (session?.user.accessLevel !== 'admin' && session?.user.accessLevel !== 'super_admin') {
        redirect('/');
    }

    const resolvedParams = await params;
    const userType = resolvedParams.type;

    if (!isUserType(userType)) {
        notFound();
    }

    const searchParamsResolved = await searchParams;

    const page = Math.max(
        1,
        parseInt(Array.isArray(searchParamsResolved.page) ? searchParamsResolved.page[0] : searchParamsResolved.page || '1')
    );
    const searchTerm = Array.isArray(searchParamsResolved.search)
        ? searchParamsResolved.search[0]
        : searchParamsResolved.search || '';
    const statusFilter = Array.isArray(searchParamsResolved.status)
        ? searchParamsResolved.status[0]
        : searchParamsResolved.status || '';

    // Only the data fetch is guarded. JSX is returned at the top level so render
    // errors propagate to an error boundary instead of being silently swallowed.
    let data: Awaited<ReturnType<typeof getUsers>>;
    try {
        data = await getUsers(page, searchTerm, userType, statusFilter);
    } catch (error) {
        console.error('Error in Users page:', error);
        notFound();
    }

    const { users, totalUsers, totalPages, activeCount, inactiveCount } = data;

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
                totalPages={totalPages}
                initialTotalUsers={totalUsers}
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                currentUserAccessLevel={session.user.accessLevel}
            />
        </div>
    );
}