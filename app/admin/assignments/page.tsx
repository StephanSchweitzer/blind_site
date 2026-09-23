import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { buildAssignmentSearchWhere } from '@/lib/search';
import AssignmentsTable from './assignments-table';
import { notFound } from 'next/navigation';
import { parsePageParam, pageSkip } from '@/lib/pagination';
import { resolveBookFilter } from '@/lib/books/bookFilter';
import { rescueEmptySearch, rescueNote, RESCUE_CANDIDATES, type RescueFilter } from '@/lib/search-rescue';
import { getUserNameOnly } from '@/lib/users/displayName';
import { getOpenAssignmentDelais, retardWhere, serializeDelaisFor, type Delai } from '@/lib/orders/delais';
import type { RescueRow, RescueSuggestion } from '@/lib/search-suggestion-types';

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
    filterBook?: { id: number; title: string },
    retard?: string,
) {
    const bookId = filterBook?.id;
    const assignmentsPerPage = 10;

    // Délais par étape — the same rule as the demandes list (lib/orders/delais.ts),
    // read once for the « Retard » filter, the row badges and the rescue notes.
    const delais = await getOpenAssignmentDelais();

    // The whole where clause for a given search term — a function so the
    // « Essayez plutôt » block can count another term, or the same one with
    // some filters `lifted` (keyed by URL parameter) — see lib/search-rescue.ts.
    const whereFor = (searchTerm: string, lifted: string[] = []): Prisma.AssignmentWhereInput => {
        const whereClause: Prisma.AssignmentWhereInput = {};

        // « Ce livre » — see lib/books/bookFilter.ts.
        if (bookId && !lifted.includes('bookId')) {
            whereClause.catalogueId = bookId;
        }

        // Tokens AND-ed across the lecteur, the auditeur, the book and the number,
        // so « morvan instructions » finds the attribution joining that person to
        // that title. See buildAssignmentSearchWhere.
        if (searchTerm) {
            const tokenClauses = buildAssignmentSearchWhere(searchTerm);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        if (statusId && !lifted.includes('statusId')) {
            whereClause.statusId = statusId;
        }

        const retardClause = lifted.includes('retard') ? null : retardWhere(retard, delais);
        if (retardClause) {
            whereClause.AND = [
                ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
                retardClause,
            ];
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

        // Only when the search found nothing — see lib/search-rescue.ts.
        const searchSuggestions =
            totalAssignments === 0 && searchTerm
                ? await rescueAssignments(searchTerm, whereFor, {
                    filterBook,
                    status: statusId ? statuses.find((st) => st.id === statusId)?.name ?? String(statusId) : null,
                    retard,
                    delais,
                })
                : [];

        return {
            searchSuggestions,
            assignments,
            totalAssignments,
            totalPages: Math.ceil(totalAssignments / assignmentsPerPage),
            availableStatuses: statuses,
            delais: serializeDelaisFor(assignments.map((a) => a.id), delais),
        };
    } catch (error) {
        console.error('Error fetching assignments:', error);
        throw new Error('Failed to fetch assignments');
    }
}

/**
 * « Essayez plutôt » for the attributions — lib/search-rescue.ts. Each
 * attribution found names its book, its lecteur and its auditeur — the three
 * things the search looks in — and, under a lifted status filter, its status.
 */
async function rescueAssignments(
    search: string,
    whereFor: (term: string, lifted?: string[]) => Prisma.AssignmentWhereInput,
    active: {
        filterBook?: { id: number; title: string };
        status: string | null;
        retard?: string;
        delais: Map<number, Delai>;
    },
): Promise<RescueSuggestion[]> {
    const filters: RescueFilter[] = [];
    if (active.filterBook) filters.push({ key: 'bookId', label: `Livre : ${active.filterBook.title}` });
    if (active.status) filters.push({ key: 'statusId', label: `Statut : ${active.status}` });
    const retardLabels: Record<string, string> = { true: 'En retard', surveiller: 'À surveiller', false: 'À jour' };
    if (active.retard && retardLabels[active.retard]) {
        filters.push({ key: 'retard', label: retardLabels[active.retard] });
    }

    const nameSelect = { name: true, email: true, firstName: true, lastName: true } as const;

    return rescueEmptySearch({
        search,
        domains: ['people', 'books'],
        filters,
        count: (q) => prisma.assignment.count({ where: whereFor(q.query, q.lifted) }),
        find: (q) =>
            prisma.assignment.findMany({
                where: whereFor(q.query, q.lifted),
                orderBy: { id: 'desc' },
                take: RESCUE_CANDIDATES,
                include: {
                    catalogue: { select: { title: true, author: true } },
                    status: { select: { name: true } },
                    readerHistory: {
                        orderBy: { assignedDate: 'desc' },
                        take: 1,
                        include: { reader: { select: nameSelect } },
                    },
                    order: { select: { aveugle: { select: nameSelect } } },
                },
            }),
        rankText: (a) =>
            [
                a.catalogue?.title,
                a.catalogue?.author,
                getUserNameOnly(a.readerHistory[0]?.reader ?? null),
                getUserNameOnly(a.order?.aveugle ?? null),
                a.id,
            ].filter(Boolean).join(' '),
        toRow: (a, q): RescueRow => {
            const reader = getUserNameOnly(a.readerHistory[0]?.reader ?? null);
            const listener = getUserNameOnly(a.order?.aveugle ?? null);
            return {
                id: a.id,
                title: `Attribution n°${a.id} — ${a.catalogue?.title ?? 'sans livre'}`,
                detail: [reader && `lecteur ${reader}`, listener && `pour ${listener}`].filter(Boolean).join(' · '),
                note: rescueNote(q.lifted, {
                    bookId: () => a.catalogue?.title ?? null,
                    statusId: () => a.status?.name ?? null,
                    retard: () => {
                        const niveau = active.delais.get(a.id)?.niveau;
                        return niveau === 'en_retard' ? 'En retard' : niveau === 'a_surveiller' ? 'À surveiller' : 'À jour';
                    },
                }),
            };
        },
    });
}

export default async function AdminAssignmentsPage({ searchParams }: PageProps) {
    const params = await searchParams;

    const page = parsePageParam(params.page);
    const searchTerm = Array.isArray(params.search) ? params.search[0] : params.search || '';
    const statusId = params.statusId
        ? parseInt(Array.isArray(params.statusId) ? params.statusId[0] : params.statusId)
        : undefined;
    const filterBook = await resolveBookFilter(params.bookId);
    const retard = Array.isArray(params.retard) ? params.retard[0] : params.retard;

    let assignments, totalAssignments, totalPages, availableStatuses, delais, searchSuggestions;
    try {
        ({ assignments, totalAssignments, totalPages, availableStatuses, delais, searchSuggestions } = await getAssignments(
            page,
            searchTerm,
            statusId,
            filterBook ?? undefined,
            retard,
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
                delais={delais!}
                searchSuggestions={searchSuggestions}
            />
        </div>
    );
}