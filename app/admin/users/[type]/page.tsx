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

export function generateStaticParams() {
    return [
        { type: 'lecteurs' },
        { type: 'auditeurs' }
    ];
}

async function getUsers(
    page: number,
    searchTerm: string,
    userType: 'lecteurs' | 'auditeurs'
) {
    const usersPerPage = 10;

    const whereClause: Prisma.UserWhereInput = {};

    if (userType === 'auditeurs') {
        whereClause.role = 'user';
    } else {
        whereClause.role = {
            in: ['admin', 'super_admin']
        };
    }

    if (searchTerm) {
        whereClause.OR = [
            {
                firstName: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive,
                },
            },
            {
                lastName: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive,
                },
            },
            {
                email: {
                    contains: searchTerm,
                    mode: Prisma.QueryMode.insensitive,
                },
            },
        ];
    }

    try {
        const [users, totalUsers] = await Promise.all([
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
                    isActive: true,
                    lastUpdated: true,
                },
            }),
            prisma.user.count({ where: whereClause }),
        ]);

        return {
            users,
            totalUsers,
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

    if (session?.user.role !== 'admin' && session?.user.role !== 'super_admin') {
        redirect('/');
    }

    const resolvedParams = await params;
    const userType = resolvedParams.type;

    if (userType !== 'lecteurs' && userType !== 'auditeurs') {
        notFound();
    }

    try {
        const searchParamsResolved = await searchParams;

        const page = Math.max(
            1,
            parseInt(Array.isArray(searchParamsResolved.page) ? searchParamsResolved.page[0] : searchParamsResolved.page || '1')
        );
        const searchTerm = Array.isArray(searchParamsResolved.search)
            ? searchParamsResolved.search[0]
            : searchParamsResolved.search || '';

        const { users, totalUsers, totalPages } = await getUsers(
            page,
            searchTerm,
            userType
        );

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
                    totalPages={totalPages}
                    initialTotalUsers={totalUsers}
                    currentUserRole={session.user.role}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Users page:', error);
        notFound();
    }
}