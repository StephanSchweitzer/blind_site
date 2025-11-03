import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import AssignmentsTable from './assignments-table';
import { notFound } from 'next/navigation';

interface PageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getAssignments(
    page: number,
    searchTerm: string,
    statusId?: number
) {
    const assignmentsPerPage = 10;

    const whereClause: Prisma.AssignmentWhereInput = {};

    // Search filter
    if (searchTerm) {
        whereClause.OR = [
            {
                reader: {
                    OR: [
                        {
                            name: {
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
                    ],
                },
            },
            {
                catalogue: {
                    OR: [
                        {
                            title: {
                                contains: searchTerm,
                                mode: Prisma.QueryMode.insensitive,
                            },
                        },
                        {
                            author: {
                                contains: searchTerm,
                                mode: Prisma.QueryMode.insensitive,
                            },
                        },
                    ],
                },
            },
        ];
    }

    // Status filter
    if (statusId) {
        whereClause.statusId = statusId;
    }

    try {
        const [assignments, totalAssignments, statuses] = await Promise.all([
            prisma.assignment.findMany({
                where: whereClause,
                orderBy: { id: 'desc' },
                skip: Math.max(0, (page - 1) * assignmentsPerPage),
                take: assignmentsPerPage,
                include: {
                    reader: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                        },
                    },
                    status: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma.assignment.count({ where: whereClause }),
            prisma.status.findMany({
                select: {
                    id: true,
                    name: true,
                },
                orderBy: {
                    sortOrder: 'asc',
                },
            }),
        ]);

        return {
            assignments,
            totalAssignments,
            totalPages: Math.ceil(totalAssignments / assignmentsPerPage),
            availableStatuses: statuses,
        };
    } catch (error) {
        console.error('Error fetching assignments:', error);
        throw new Error('Failed to fetch assignments');
    }
}

export default async function AdminAssignmentsPage({ searchParams }: PageProps) {
    try {
        const params = await searchParams;

        const page = Math.max(
            1,
            parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1')
        );
        const searchTerm = Array.isArray(params.search)
            ? params.search[0]
            : params.search || '';
        const statusId = params.statusId
            ? parseInt(Array.isArray(params.statusId) ? params.statusId[0] : params.statusId)
            : undefined;

        const { assignments, totalAssignments, totalPages, availableStatuses } = await getAssignments(
            page,
            searchTerm,
            statusId
        );

        // Serialize assignments
        const serializedAssignments = assignments.map(assignment => ({
            ...assignment,
            receptionDate: assignment.receptionDate ? assignment.receptionDate.toISOString() : null,
            sentToReaderDate: assignment.sentToReaderDate ? assignment.sentToReaderDate.toISOString() : null,
            returnedToECADate: assignment.returnedToECADate ? assignment.returnedToECADate.toISOString() : null,
        }));

        return (
            <div className="space-y-4">
                <AssignmentsTable
                    initialAssignments={serializedAssignments}
                    initialPage={page}
                    initialSearch={searchTerm}
                    totalPages={totalPages}
                    availableStatuses={availableStatuses}
                    initialTotalAssignments={totalAssignments}
                />
            </div>
        );
    } catch (error) {
        console.error('Error in Admin Assignments page:', error);
        notFound();
    }
}