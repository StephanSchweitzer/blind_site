import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { buildAssignmentSearchWhere } from '@/lib/search';
import AssignmentsTable from './assignments-table';
import { notFound } from 'next/navigation';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { resolveBookFilter } from '@/lib/books/bookFilter';
import { suggestSearches } from '@/lib/search-suggest';

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
    statusId?: number,
    bookId?: number
) {
    const assignmentsPerPage = 10;

    // The whole where clause for a given search term — a function so the
    // « Vouliez-vous dire » check counts another term under the same filters.
    const whereFor = (searchTerm: string): Prisma.AssignmentWhereInput => {
        const whereClause: Prisma.AssignmentWhereInput = {};

        // « Ce livre » — see lib/books/bookFilter.ts.
        if (bookId) {
            whereClause.catalogueId = bookId;
        }

        // Tokens AND-ed across the lecteur, the auditeur, the book and the number,
        // so « morvan instructions » finds the attribution joining that person to
        // that title. See buildAssignmentSearchWhere.
        if (searchTerm) {
            const tokenClauses = buildAssignmentSearchWhere(searchTerm);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (statusId) {
            whereClause.statusId = statusId;
        }
        return whereClause;
    };
    const whereClause = whereFor(searchTerm);
    try {
        const [assignments, totalAssignments, statuses] = await Promise.all([
            prisma.assignment.findMany({
                where: whereClause,
                orderBy: { id: 'desc' },
                skip: pageSkip(page, assignmentsPerPage),
                take: assignmentsPerPage,
                include: {
                    readerHistory: {
                        orderBy: {
                            assignedDate: 'desc',
                        },
                        take: 1,
                        include: {
                            reader: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    firstName: true,
                                    lastName: true,
                                },
                            },
                        },
                    },
                    catalogue: {
                        select: {
                            id: true,
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
                            id: true,
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

        // Only when the search found nothing — see lib/search-suggest.ts.
        const searchSuggestions =
            totalAssignments === 0 && searchTerm
                ? await suggestSearches(searchTerm, ['people', 'books'], (q) =>
                    prisma.assignment.count({ where: whereFor(q) }))
                : [];

        return {
            searchSuggestions,
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
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search || '';
    const statusId = params.statusId
        ? parseInt(Array.isArray(params.statusId) ? params.statusId[0] : params.statusId)
        : undefined;
    const filterBook = await resolveBookFilter(params.bookId);

    let assignments, totalAssignments, totalPages, availableStatuses, searchSuggestions;
    try {
        ({ assignments, totalAssignments, totalPages, availableStatuses, searchSuggestions } = await getAssignments(
            page,
            searchTerm,
            statusId,
            filterBook?.id
        ));
    } catch (error) {
        console.error('Error in Admin Assignments page:', error);
        notFound();
    }

    const serializedAssignments = assignments!.map(assignment => {
        const currentReader = assignment.readerHistory[0]?.reader || null;

        return {
            id: assignment.id,
            catalogueId: assignment.catalogueId,
            orderId: assignment.orderId,
            receptionDate: assignment.receptionDate ? assignment.receptionDate.toISOString() : null,
            sentToReaderDate: assignment.sentToReaderDate ? assignment.sentToReaderDate.toISOString() : null,
            returnedToECADate: assignment.returnedToECADate ? assignment.returnedToECADate.toISOString() : null,
            statusId: assignment.statusId,
            notes: assignment.notes,
            deliveryMethod: assignment.deliveryMethod,
            currentReader: currentReader ? {
                id: currentReader.id,
                name: currentReader.name,
                email: currentReader.email,
                firstName: currentReader.firstName,
                lastName: currentReader.lastName,
            } : null,
            catalogue: assignment.catalogue,
            order: assignment.order,
            status: assignment.status,
            processedByStaffId: assignment.processedByStaffId,
        };
    });

    return (
        <div className="space-y-4">
            <AssignmentsTable
                initialAssignments={serializedAssignments}
                initialPage={page}
                initialSearch={searchTerm}
                totalPages={totalPages!}
                availableStatuses={availableStatuses!}
                initialTotalAssignments={totalAssignments!}
                filterBook={filterBook}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}