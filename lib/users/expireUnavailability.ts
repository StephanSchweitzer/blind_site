import { prisma } from '@/lib/prisma';
import { parisDayStart } from '@/lib/users/activityStatus';

/**
 * Closes the indisponibilités whose window has elapsed: the stored status goes
 * back to ACTIVE, the window is cleared, and the change is written to the
 * UserActivityEvent history like any other status change.
 *
 * WHY THIS EXISTS, given that resolveEffectiveActivityStatus() already makes an
 * elapsed window READ as Actif:
 *
 *   - the read-time resolver is what makes the app CORRECT (a person is never
 *     wrongly blocked, even if this sweep never runs);
 *   - this sweep is what makes the DATA honest. Without it, a member stays
 *     stored as UNAVAILABLE forever, their history has no "back to Actif" entry,
 *     and anything reading the raw column (exports, SQL, a future report) sees a
 *     stale status.
 *
 * The two must never disagree, and they can't: the sweep only ever applies the
 * transition the resolver has already been reporting. Running it, not running
 * it, or running it twice all produce the same visible state — which is exactly
 * what lets it run opportunistically on a page load AND on a nightly cron.
 *
 * Windows with no end date (`unavailableUntil IS NULL`, legacy Access imports)
 * are deliberately NOT touched: an open-ended indisponibilité has no term to
 * reach, so it needs a human decision. /admin/disponibilites lists them.
 */

export interface ExpiryResult {
    /** How many members were flipped back to Actif by THIS call. */
    closed: number;
    userIds: number[];
}

const REASON = "Fin d'indisponibilité";
// The end date is appended in SQL (to_char on the pre-update row), so the
// history entry names the day the window actually closed.
const COMMENT_PREFIX = "Retour automatique au statut « Actif » : l'indisponibilité s'est terminée le ";

/**
 * One statement, so it is atomic and exactly-once even when the nightly cron
 * and a page load fire together: `due` locks the rows it selects (FOR UPDATE),
 * a concurrent caller blocks there and then re-evaluates the WHERE against the
 * committed row, finds it no longer UNAVAILABLE, and closes nothing. That is
 * also why the history INSERT reads `due` (the pre-update snapshot) — it keeps
 * the dates the member was actually unavailable on, which the UPDATE nulls out.
 *
 * Raw SQL bypasses the soft-delete extension (lib/prisma.ts), hence the
 * explicit `deletedAt IS NULL`.
 */
export async function closeElapsedUnavailabilities(now: Date = new Date()): Promise<ExpiryResult> {
    const today = parisDayStart(now);

    const rows = await prisma.$queryRaw<{ userId: number }[]>`
        WITH due AS (
            SELECT id, "unavailableFrom", "unavailableUntil"
            FROM "User"
            WHERE "activityStatus" = 'UNAVAILABLE'::"UserActivityStatus"
              AND "deletedAt" IS NULL
              AND "unavailableUntil" IS NOT NULL
              AND "unavailableUntil" < ${today}
            FOR UPDATE
        ),
        updated AS (
            UPDATE "User" u
            SET "activityStatus"    = 'ACTIVE'::"UserActivityStatus",
                "activityChangedAt" = ${now},
                "unavailableFrom"   = NULL,
                "unavailableUntil"  = NULL,
                "lastUpdated"       = ${now}
            FROM due
            WHERE u.id = due.id
            RETURNING u.id
        )
        INSERT INTO "UserActivityEvent"
            ("userId", "fromStatus", "toStatus", "reason", "comment",
             "unavailableFrom", "unavailableUntil", "changedById", "changedAt")
        SELECT due.id,
               'UNAVAILABLE'::"UserActivityStatus",
               'ACTIVE'::"UserActivityStatus",
               ${REASON},
               ${COMMENT_PREFIX}::text || to_char(due."unavailableUntil", 'DD/MM/YYYY') || '.',
               due."unavailableFrom",
               due."unavailableUntil",
               NULL,
               ${now}
        FROM due
        RETURNING "userId"`;

    return { closed: rows.length, userIds: rows.map((r) => r.userId) };
}

/**
 * The same sweep, but safe to `await` from a server component render: a failure
 * is logged and swallowed rather than blowing up the page. The page stays
 * correct without it — the effective status is still resolved at read time.
 */
export async function closeElapsedUnavailabilitiesQuietly(now?: Date): Promise<ExpiryResult> {
    try {
        return await closeElapsedUnavailabilities(now);
    } catch (error) {
        console.error('closeElapsedUnavailabilities failed:', error);
        return { closed: 0, userIds: [] };
    }
}

/** "3 indisponibilités terminées ont été clôturées." — for toasts and cron logs. */
export function describeExpiryResult(result: ExpiryResult): string {
    if (result.closed === 0) return 'Aucune indisponibilité arrivée à terme.';
    if (result.closed === 1) return '1 indisponibilité terminée a été clôturée : la personne est de nouveau active.';
    return `${result.closed} indisponibilités terminées ont été clôturées : ces personnes sont de nouveau actives.`;
}
