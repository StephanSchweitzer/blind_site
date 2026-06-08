import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// ⚠️ ADJUST this import to wherever your assignments-table.tsx actually lives.
import AssignmentsTable from '@/app/admin/assignments/assignments-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ASSIGNMENTS_PER_PAGE = 10;

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function AffectationsTab({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    const userId = parseInt(id);

    const page = Math.max(1, parseInt(Array.isArray(sp.page) ? sp.page[0] : sp.page || '1'));
    const searchTerm = Array.isArray(sp.search) ? sp.search[0] : sp.search || '';
    const statusId = sp.statusId
        ? parseInt(Array.isArray(sp.statusId) ? sp.statusId[0] : sp.statusId)
        : undefined;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { memberType: true, name: true, firstName: true, lastName: true, email: true },
    });

    // A lecteur's dossier shows assignments they read; everyone else's shows
    // assignments tied to their own orders (as the aveugle).
    const isReader = user?.memberType === 'lecteur';
    const presetReader =
        isReader && user
            ? { id: userId, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email ?? '' }
            : null;
    const whereClause: Prisma.AssignmentWhereInput = isReader
        ? { readerHistory: { some: { readerId: userId } } }
        : { order: { is: { aveugleId: userId } } };

    if (searchTerm) {
        whereClause.OR = [
            {
                readerHistory: {
                    some: {
                        reader: {
                            OR: [
                                { name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                                { email: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                            ],
                        },
                    },
                },
            },
            {
                catalogue: {
                    OR: [
                        { title: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                        { author: { contains: searchTerm, mode: Prisma.QueryMode.insensitive } },
                    ],
                },
            },
        ];
    }

    if (statusId) whereClause.statusId = statusId;

    const [assignments, totalAssignments, statuses] = await Promise.all([
        prisma.assignment.findMany({
            where: whereClause,
            orderBy: { id: 'desc' },
            skip: Math.max(0, (page - 1) * ASSIGNMENTS_PER_PAGE),
            take: ASSIGNMENTS_PER_PAGE,
            include: {
                readerHistory: {
                    orderBy: { assignedDate: 'desc' },
                    take: 1,
                    include: { reader: { select: { id: true, name: true, email: true } } },
                },
                catalogue: { select: { id: true, title: true, author: true } },
                order: { select: { id: true } },
                status: { select: { id: true, name: true } },
            },
        }),
        prisma.assignment.count({ where: whereClause }),
        prisma.status.findMany({
            select: { id: true, name: true },
            orderBy: { sortOrder: 'asc' },
        }),
    ]);

    const serializedAssignments = assignments.map((assignment) => {
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
            currentReader: currentReader
                ? { id: currentReader.id, name: currentReader.name, email: currentReader.email }
                : null,
            catalogue: assignment.catalogue,
            order: assignment.order,
            status: assignment.status,
            processedByStaffId: assignment.processedByStaffId,
        };
    });

    return (
        <AssignmentsTable
            initialAssignments={serializedAssignments}
            initialPage={page}
            initialSearch={searchTerm}
            totalPages={Math.ceil(totalAssignments / ASSIGNMENTS_PER_PAGE)}
            availableStatuses={statuses}
            initialTotalAssignments={totalAssignments}
            hideSearch
            presetClientId={isReader ? null : userId}
            presetReader={presetReader}
        />
    );
}