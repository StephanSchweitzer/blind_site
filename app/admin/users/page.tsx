import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import UsersTable from './users-table';
import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getUsers(
    page: number,
    searchTerm: string,
    roleFilter?: string
) {
    const usersPerPage = 10;

    const whereClause: Prisma.UserWhereInput = {};

    // Search filter
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

    // Role filter
    if (roleFilter && roleFilter !== 'all') {
        whereClause.role = roleFilter;
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

export default async function AdminUsersPage({ searchParams }: PageProps) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login');
    }

    if (session?.user.role !== 'admin' && session?.user.role !== 'super_admin') {
        redirect('/');
    }

    try {
        const params = await searchParams;

        const page = Math.max(
            1,
            parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
        );
        const searchTerm = Array.isArray(params.search)
            ? params.search[0]
            : params.search || '';
        const roleFilter = Array.isArray(params.role)
            ? params.role[0]
            : params.role || undefined;

        const { users, totalUsers, totalPages } = await getUsers(
            page,
            searchTerm,
            roleFilter
        );

        // Serialize dates
        const serializedUsers = users.map(user => ({
            ...user,
            lastUpdated: user.lastUpdated ? user.lastUpdated.toISOString() : null,
        }));

        return (
            <div className="space-y-4">
                <UsersTable
                    initialUsers={serializedUsers}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                    initialTotalUsers={totalUsers}
                    initialRoleFilter={roleFilter}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Admin Users page:', error);
        notFound();
    }
}