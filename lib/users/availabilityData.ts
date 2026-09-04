import { prisma } from '@/lib/prisma';
import { composeUserDisplayName } from '@/lib/users/activityGuard';
import { getActiveAssignmentCounts, isOpenAssignmentStatusName } from '@/lib/users/deletionGuard';
import {
    effectivelyActiveWhere,
    parisDayStart,
    resolveEffectiveActivityStatus,
    toDayString,
} from '@/lib/users/activityStatus';
import { closeElapsedUnavailabilitiesQuietly } from '@/lib/users/expireUnavailability';
import { AVAILABILITY_WARNING_DAYS } from '@/lib/users/availability';
import type {
    AvailabilityActivityEvent,
    AvailabilityAssignment,
    AvailabilityPerson,
    AvailabilityResponse,
    PersonAvailabilityDetail,
} from '@/types';

/**
 * The user columns an availability read needs — the overview and the per-person
 * detail select exactly the same thing, so a person opened from the screen can
 * never read differently from their own row in the tables behind it.
 */
const availabilitySelect = {
    id: true,
    name: true,
    email: true,
    firstName: true,
    lastName: true,
    civility: { select: { name: true } },
    memberType: true,
    accessLevel: true,
    activityStatus: true,
    unavailableFrom: true,
    unavailableUntil: true,
    isAvailable: true,
    availabilityNotes: true,
    maxConcurrentAssignments: true,
    specialization: true,
    languages: { select: { language: true } },
} as const;

/** Structural shape of a row read through `availabilitySelect`. */
interface AvailabilityRow {
    id: number;
    name: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    civility: { name: string } | null;
    memberType: string;
    accessLevel: string;
    activityStatus: string;
    unavailableFrom: Date | null;
    unavailableUntil: Date | null;
    isAvailable: boolean | null;
    availabilityNotes: string | null;
    maxConcurrentAssignments: number | null;
    specialization: string | null;
    languages: { language: string }[];
}

function toAvailabilityPerson(
    row: AvailabilityRow,
    context: { now: Date; activeAssignments: number; lastAssignedAt: Date | null }
): AvailabilityPerson {
    return {
        id: row.id,
        name: composeUserDisplayName(row),
        email: row.email,
        memberType: row.memberType,
        accessLevel: row.accessLevel,
        activityStatus: row.activityStatus,
        effectiveStatus: resolveEffectiveActivityStatus(row, context.now),
        unavailableFrom: toDayString(row.unavailableFrom),
        unavailableUntil: toDayString(row.unavailableUntil),
        // Null means "never set" — treat it as available, the same reading
        // the assignable filter in /api/user/search uses (`not: false`).
        isAvailable: row.isAvailable !== false,
        availabilityNotes: row.availabilityNotes,
        activeAssignments: context.activeAssignments,
        maxConcurrentAssignments: row.maxConcurrentAssignments,
        lastAssignedAt: toDayString(context.lastAssignedAt),
        specialization: row.specialization,
        languages: row.languages.map((l) => l.language),
    };
}

/**
 * The single query behind /admin/disponibilites.
 *
 * Scope: everyone who is relevant to an availability question — every lecteur
 * (they are the resource being planned) plus anyone at all carrying an
 * indisponibilité, whatever their member type, so an auditeur or a permanent
 * away for a month still shows on the calendar. Everybody else is left out;
 * the whole point is a page you can read in one screen.
 */
export async function getAvailabilityOverview(options?: {
    /** Runs the elapsed-indisponibilité sweep first. Default true. */
    sweep?: boolean;
    now?: Date;
}): Promise<AvailabilityResponse> {
    const now = options?.now ?? new Date();

    // Done BEFORE reading, so the page never shows an indisponibilité that has
    // already run its term as still open. The sweep is idempotent and does
    // nothing on the (overwhelmingly common) day where nothing has elapsed.
    const swept =
        options?.sweep === false
            ? { closed: 0, userIds: [] }
            : await closeElapsedUnavailabilitiesQuietly(now);

    const rows = await prisma.user.findMany({
        where: {
            OR: [{ memberType: 'lecteur' }, { activityStatus: 'UNAVAILABLE' }],
        },
        select: availabilitySelect,
    });

    const readerIds = rows.filter((r) => r.memberType === 'lecteur').map((r) => r.id);

    const [assignmentCounts, lastAssigned] = await Promise.all([
        getActiveAssignmentCounts(readerIds),
        readerIds.length === 0
            ? Promise.resolve([])
            : prisma.assignmentReader.groupBy({
                by: ['readerId'],
                // Voir getActiveAssignmentCounts : une ligne AssignmentReader
                // survit à la suppression de son attribution, donc « dernière
                // attribution le… » aurait daté d'une attribution effacée.
                where: { readerId: { in: readerIds }, assignment: { deletedAt: null } },
                _max: { assignedDate: true },
            }),
    ]);

    const lastAssignedByReader = new Map<number, Date | null>(
        lastAssigned.map((row) => [row.readerId, row._max.assignedDate])
    );

    const people: AvailabilityPerson[] = rows
        .map((row) =>
            toAvailabilityPerson(row, {
                now,
                activeAssignments: assignmentCounts.get(row.id) ?? 0,
                lastAssignedAt: lastAssignedByReader.get(row.id) ?? null,
            })
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    return {
        today: parisDayStart(now).toISOString().slice(0, 10),
        warningDays: AVAILABILITY_WARNING_DAYS,
        people,
        justClosed: swept.closed,
    };
}

/** Status changes kept on the person panel — enough to read the last moves. */
const PERSON_EVENT_LIMIT = 8;

/** Attributions listed on the person panel, open ones first. */
const PERSON_ASSIGNMENT_LIMIT = 25;

/**
 * The attributions a person is the LATEST reader on — the same rule
 * getActiveAssignmentCounts counts by, so the list and the "3 / 4" badge above
 * it can never disagree. Closed ones are kept (after the open ones) because
 * "this lecteur finished four books last month" is precisely the context a
 * permanent wants before handing them a fifth.
 */
async function getPersonAssignments(userId: number): Promise<AvailabilityAssignment[]> {
    const readerRows = await prisma.assignmentReader.findMany({
        // Même filtre que le badge « 3 / 4 » au-dessus (getActiveAssignmentCounts),
        // pour que la liste et le compte ne puissent pas se contredire.
        where: { readerId: userId, assignment: { deletedAt: null } },
        select: { assignmentId: true },
    });
    const assignmentIds = [...new Set(readerRows.map((r) => r.assignmentId))];
    if (assignmentIds.length === 0) return [];

    // Latest reader per assignment: one a lecteur has since been relieved of is
    // no longer theirs and must not show up here.
    const latest = await prisma.assignmentReader.findMany({
        where: { assignmentId: { in: assignmentIds }, assignment: { deletedAt: null } },
        orderBy: { assignedDate: 'desc' },
        distinct: ['assignmentId'],
        select: {
            readerId: true,
            assignedDate: true,
            assignment: {
                select: {
                    id: true,
                    orderId: true,
                    sentToReaderDate: true,
                    returnedToECADate: true,
                    catalogue: { select: { title: true, author: true } },
                    status: { select: { id: true, name: true } },
                },
            },
        },
    });

    return latest
        .filter((row) => row.readerId === userId)
        .map((row) => ({
            id: row.assignment.id,
            orderId: row.assignment.orderId,
            bookTitle: row.assignment.catalogue?.title ?? 'Livre inconnu',
            bookAuthor: row.assignment.catalogue?.author ?? null,
            statusId: row.assignment.status?.id ?? 0,
            statusName: row.assignment.status?.name ?? 'Sans statut',
            open: isOpenAssignmentStatusName(row.assignment.status?.name),
            assignedDate: toDayString(row.assignedDate),
            sentToReaderDate: toDayString(row.assignment.sentToReaderDate),
            returnedToECADate: toDayString(row.assignment.returnedToECADate),
        }))
        .sort(
            (a, b) =>
                Number(b.open) - Number(a.open) ||
                (b.assignedDate ?? '').localeCompare(a.assignedDate ?? '')
        )
        .slice(0, PERSON_ASSIGNMENT_LIMIT);
}

/**
 * Everything the person panel of /admin/disponibilites shows: the same
 * AvailabilityPerson the tables are built from, their attributions, and their
 * recent status history.
 *
 * Deliberately NOT restricted to the overview's scope (lecteurs + anyone
 * indisponible): the panel is also how a permanent declares an absence for
 * somebody who has none yet, and that person is by definition absent from the
 * overview payload. Returns null when the id matches nobody.
 */
export async function getPersonAvailability(
    userId: number,
    now: Date = new Date()
): Promise<PersonAvailabilityDetail | null> {
    const row = await prisma.user.findUnique({
        where: { id: userId },
        select: availabilitySelect,
    });
    if (!row) return null;

    const [counts, lastAssigned, assignments, events] = await Promise.all([
        getActiveAssignmentCounts([userId]),
        prisma.assignmentReader.aggregate({
            where: { readerId: userId },
            _max: { assignedDate: true },
        }),
        getPersonAssignments(userId),
        prisma.userActivityEvent.findMany({
            where: { userId },
            orderBy: { changedAt: 'desc' },
            take: PERSON_EVENT_LIMIT,
            select: {
                id: true,
                fromStatus: true,
                toStatus: true,
                reason: true,
                comment: true,
                unavailableFrom: true,
                unavailableUntil: true,
                changedAt: true,
                changedBy: {
                    select: { id: true, name: true, email: true, firstName: true, lastName: true, civility: { select: { name: true } } },
                },
            },
        }),
    ]);

    const person = toAvailabilityPerson(row, {
        now,
        activeAssignments: counts.get(userId) ?? 0,
        lastAssignedAt: lastAssigned._max.assignedDate ?? null,
    });

    const flatEvents: AvailabilityActivityEvent[] = events.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        comment: event.comment,
        unavailableFrom: toDayString(event.unavailableFrom),
        unavailableUntil: toDayString(event.unavailableUntil),
        changedAt: event.changedAt.toISOString(),
        changedBy: event.changedBy ? composeUserDisplayName(event.changedBy) : null,
    }));

    return {
        today: parisDayStart(now).toISOString().slice(0, 10),
        person,
        assignments,
        openAssignments: assignments.filter((a) => a.open).length,
        events: flatEvents,
    };
}

/**
 * Cheap version of freeReaders() from lib/users/availability.ts for the main
 * dashboard tile: active lecteurs, not flagged unavailable, with no
 * attribution in progress — the number a permanent actually wants to see
 * under "Disponibilités" (who can I hand the next demande to), not how many
 * are away.
 */
export async function getFreeReaderCount(now: Date = new Date()): Promise<number> {
    const candidates = await prisma.user.findMany({
        where: {
            memberType: 'lecteur',
            isAvailable: { not: false },
            ...effectivelyActiveWhere(now),
        },
        select: { id: true },
    });
    if (candidates.length === 0) return 0;

    const counts = await getActiveAssignmentCounts(candidates.map((c) => c.id));
    let free = 0;
    for (const count of counts.values()) if (count === 0) free += 1;
    return free;
}
