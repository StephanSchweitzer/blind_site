import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { andClauses, buildAssignmentSearchWhere } from '@/lib/search';
import { getOpenAssignmentDelais, retardWhere, serializeDelaisFor } from '@/lib/orders/delais';
import { resolveBookFilter } from '@/lib/books/bookFilter';

// ⚠️ ADJUST this import to wherever your assignments-table.tsx actually lives.
import AssignmentsTable from '@/app/admin/assignments/assignments-table';
import { parsePageParam, pageSkip } from '@/lib/pagination';

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

    const page = parsePageParam(sp.page);
    const searchTerm = Array.isArray(sp.search) ? sp.search[0] : sp.search || '';
    const statusId = sp.statusId
        ? parseInt(Array.isArray(sp.statusId) ? sp.statusId[0] : sp.statusId)
        : undefined;
    // Cet onglet honore TOUS les filtres de la liste — seule la recherche libre
    // y est masquee. Le champ « Livre » en fait partie : sans cela il s'affiche
    // ici (c'est la meme AssignmentsTable) sans rien filtrer.
    const filterBook = await resolveBookFilter(sp.bookId);

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
    // Not the reader (who does the work) — the aveugle whose demandes this
    // dossier shows. Assignment has no aveugleId of its own to preset with,
    // so this is display-only context next to the (already client-filtered)
    // Demande picker, the same way the demande/facture/paiement forms show it.
    const presetClient =
        !isReader && user
            ? { id: userId, name: user.name, firstName: user.firstName, lastName: user.lastName, email: user.email ?? '' }
            : null;
    const ownWhere: Prisma.AssignmentWhereInput = isReader
        ? { readerHistory: { some: { readerId: userId } } }
        : { order: { is: { aveugleId: userId } } };
    const whereClause: Prisma.AssignmentWhereInput = { ...ownWhere };

    // Exactement le moteur de /admin/assignments, et non plus une copie réduite :
    // un mot pouvait y désigner le lecteur OU le livre, mais jamais l'un et
    // l'autre dans la même saisie, et le sous-titre comme le numéro de demande
    // en étaient absents. Voir buildAssignmentSearchWhere.
    const tokenClauses = buildAssignmentSearchWhere(searchTerm);
    if (tokenClauses) whereClause.AND = tokenClauses;

    if (statusId) whereClause.statusId = statusId;
    if (filterBook) whereClause.catalogueId = filterBook.id;

    // The same délais par étape as the global list (lib/orders/delais.ts).
    const retard = Array.isArray(sp.retard) ? sp.retard[0] : sp.retard;
    const delais = await getOpenAssignmentDelais(ownWhere);
    const retardClause = retardWhere(retard, delais);
    if (retardClause) whereClause.AND = [...andClauses(whereClause), retardClause];

    const [assignments, totalAssignments, statuses] = await Promise.all([
        prisma.assignment.findMany({
            where: whereClause,
            orderBy: { id: 'desc' },
            skip: pageSkip(page, ASSIGNMENTS_PER_PAGE),
            take: ASSIGNMENTS_PER_PAGE,
            include: {
                readerHistory: {
                    orderBy: { assignedDate: 'desc' },
                    take: 1,
                    include: {
                        reader: {
                            select: { id: true, name: true, email: true, firstName: true, lastName: true },
                        },
                    },
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
            deliveryMethod: assignment.deliveryMethod,
            currentReader: currentReader
                ? {
                      id: currentReader.id,
                      name: currentReader.name,
                      email: currentReader.email,
                      firstName: currentReader.firstName,
                      lastName: currentReader.lastName,
                  }
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
            presetClient={presetClient}
            filterBook={filterBook}
            delais={serializeDelaisFor(assignments.map((a) => a.id), delais)}
        />
    );
}