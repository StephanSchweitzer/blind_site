import { prisma } from '@/lib/prisma';
import { composeUserDisplayName } from '@/lib/users/activityGuard';
import { getActiveAssignmentCounts } from '@/lib/users/deletionGuard';
import {
    parisDayStart,
    resolveEffectiveActivityStatus,
    toDayString,
} from '@/lib/users/activityStatus';
import { closeElapsedUnavailabilitiesQuietly } from '@/lib/users/expireUnavailability';
import { AVAILABILITY_WARNING_DAYS } from '@/lib/users/availability';
import type { AvailabilityPerson, AvailabilityResponse } from '@/types';

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
        select: {
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
        },
    });

    const readerIds = rows.filter((r) => r.memberType === 'lecteur').map((r) => r.id);

    const [assignmentCounts, lastAssigned] = await Promise.all([
        getActiveAssignmentCounts(readerIds),
        readerIds.length === 0
            ? Promise.resolve([])
            : prisma.assignmentReader.groupBy({
                by: ['readerId'],
                where: { readerId: { in: readerIds } },
                _max: { assignedDate: true },
            }),
    ]);

    const lastAssignedByReader = new Map<number, Date | null>(
        lastAssigned.map((row) => [row.readerId, row._max.assignedDate])
    );

    const people: AvailabilityPerson[] = rows
        .map((row) => ({
            id: row.id,
            name: composeUserDisplayName(row),
            memberType: row.memberType,
            accessLevel: row.accessLevel,
            activityStatus: row.activityStatus,
            effectiveStatus: resolveEffectiveActivityStatus(row, now),
            unavailableFrom: toDayString(row.unavailableFrom),
            unavailableUntil: toDayString(row.unavailableUntil),
            // Null means "never set" — treat it as available, the same reading
            // the assignable filter in /api/user/search uses (`not: false`).
            isAvailable: row.isAvailable !== false,
            availabilityNotes: row.availabilityNotes,
            activeAssignments: assignmentCounts.get(row.id) ?? 0,
            maxConcurrentAssignments: row.maxConcurrentAssignments,
            lastAssignedAt: toDayString(lastAssignedByReader.get(row.id) ?? null),
            specialization: row.specialization,
            languages: row.languages.map((l) => l.language),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    return {
        today: parisDayStart(now).toISOString().slice(0, 10),
        warningDays: AVAILABILITY_WARNING_DAYS,
        people,
        justClosed: swept.closed,
    };
}
