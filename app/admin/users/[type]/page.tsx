import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import UsersTable from './users-table';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { UserTypeTabs } from './user-type-tabs';

interface PageProps {
    params: Promise<{ type: string }>;
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type UserType = 'auditeurs' | 'lecteurs' | 'permanents';

export function generateStaticParams() {
    return [
        { type: 'auditeurs' },
        { type: 'lecteurs' },
        { type: 'permanents' },
    ];
}

async function getUsers(
    page: number,
    searchTerm: string,
    userType: UserType
) {
    const usersPerPage = 10;

    const whereClause: Prisma.UserWhereInput =
        userType === 'auditeurs'  ? { memberType: 'auditeur' } :
            userType === 'lecteurs'   ? { memberType: 'lecteur' } :
                { accessLevel: { in: ['admin', 'super_admin'] } };

    if (searchTerm) {
        // Split on whitespace so "Leila Be" matches firstName="Leila" + lastName="Bennour".
        // Each token must match at least one field (AND across tokens, OR across fields),
        // which also makes the order irrelevant ("Bennour Leila" works too).
        const tokens = searchTerm.trim().split(/\s+/).filter(Boolean);

        if (tokens.length > 0) {
            whereClause.AND = tokens.map((token) => ({
                OR: [
                    { firstName: { contains: token, mode: Prisma.QueryMode.insensitive } },
                    { lastName:  { contains: token, mode: Prisma.QueryMode.insensitive } },
                    { email:     { contains: token, mode: Prisma.QueryMode.insensitive } },
                ],
            }));
        }
    }

    try {
        const [users, totalUsers, activeCount, inactiveCount] = await Promise.all([
            prisma.user.findMany({
                where: whereClause,
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
                    isActive: true,
                    lastUpdated: true,
                },
            }),
            prisma.user.count({ where: whereClause }),
            prisma.user.count({ where: { ...whereClause, isActive: true } }),
            prisma.user.count({ where: { ...whereClause, isActive: false } }),
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

    if (userType !== 'auditeurs' && userType !== 'lecteurs' && userType !== 'permanents') {
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

    // Only the data fetch is guarded. JSX is returned at the top level so render
    // errors propagate to an error boundary instead of being silently swallowed.
    let data: Awaited<ReturnType<typeof getUsers>>;
    try {
        data = await getUsers(page, searchTerm, userType as UserType);
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
                type={userType as UserType}
                initialUsers={serializedUsers}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages}
                initialTotalUsers={totalUsers}
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                currentUserAccessLevel={session.user.accessLevel}
            />
        </div>
    );
}