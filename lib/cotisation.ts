// Single source of truth for "is this member's cotisation up to date, and when
// does it expire?". Kept as a pure module (NO Prisma import) so it can be used
// from server components/routes AND 'use client' components alike — same reason
// lib/payment-enums.ts is defined locally.
//
// Callers must pass only ACTIVE payments of type COTISATION (isActive: true,
// type: 'COTISATION'). This helper does not know about Prisma or filtering.

/** The subset of Payment fields this helper needs. Dates may arrive as Date
 *  objects (Prisma, server) or ISO strings (JSON, client). */
export interface CotisationPaymentInput {
    cotisationYear: number | null;
    paymentDate: Date | string | null;
    creationDate: Date | string;
}

export interface CotisationStatus {
    /** true when the computed expiry is today or later. */
    isPaid: boolean;
    /** When the current cotisation lapses. null when the member has no cotisation. */
    expiresAt: Date | null;
    /** The year the cotisation covers (from cotisationYear, else the reference year). */
    coverYear: number | null;
    /** Reference date of the cotisation that grants the current coverage
     *  (paymentDate ?? creationDate). */
    latestPaymentDate: Date | null;
}

/** End of 31 December of a given year (local time) — the expiry of a
 *  calendar-year cotisation covering that year. */
function endOfYear(year: number): Date {
    return new Date(year, 11, 31, 23, 59, 59, 999);
}

/** Coverage a single cotisation payment grants:
 *  - When `cotisationYear` is set (the authoritative, admin-entered year), the
 *    cotisation covers that CALENDAR year and expires on 31 Dec of it.
 *  - Legacy rows without a `cotisationYear` keep the old ROLLING rule:
 *    a full year from the reference date (paymentDate ?? creationDate). */
function paymentCoverage(
    p: CotisationPaymentInput,
): { expiresAt: Date; coverYear: number; ref: Date } | null {
    const ref = referenceDate(p);

    if (p.cotisationYear != null) {
        return { expiresAt: endOfYear(p.cotisationYear), coverYear: p.cotisationYear, ref: ref ?? endOfYear(p.cotisationYear) };
    }

    if (ref) {
        const expiresAt = new Date(ref);
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        return { expiresAt, coverYear: ref.getFullYear(), ref };
    }

    return null;
}

function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** The date a cotisation is anchored on: the payment date when known, else the
 *  record's creation date. */
function referenceDate(p: CotisationPaymentInput): Date | null {
    return toDate(p.paymentDate) ?? toDate(p.creationDate);
}

/**
 * Compute the current cotisation status from a member's active COTISATION
 * payments.
 *
 * RULE: coverage is CALENDAR-YEAR, driven by each payment's `cotisationYear`
 * (expires 31 Dec of that year). Payments with no `cotisationYear` (legacy rows)
 * fall back to the old ROLLING rule (one year from the reference date). See
 * paymentCoverage(). The payment granting the LATEST expiry wins — so prepaying
 * a future year while the current one is already covered extends coverage rather
 * than being masked by a more recent same-year payment. Output shape is
 * unchanged; nothing downstream (form banner, dossier header) needs to change.
 */
export function computeCotisationStatus(
    payments: CotisationPaymentInput[],
): CotisationStatus {
    const covered = payments
        .map(paymentCoverage)
        .filter((x): x is { expiresAt: Date; coverYear: number; ref: Date } => x !== null);

    if (covered.length === 0) {
        return { isPaid: false, expiresAt: null, coverYear: null, latestPaymentDate: null };
    }

    // The furthest expiry is the member's real coverage horizon.
    covered.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
    const best = covered[0];

    const isPaid = best.expiresAt.getTime() >= Date.now();

    return {
        isPaid,
        expiresAt: best.expiresAt,
        coverYear: best.coverYear,
        latestPaymentDate: best.ref,
    };
}

/**
 * DB-query counterpart of computeCotisationStatus — the parts a caller needs to
 * build the "currently à jour" Prisma filter. Keep the two in sync.
 *
 * A member is à jour iff they have an active COTISATION payment that is EITHER:
 *   - calendar-year: `cotisationYear >= currentYear` (covers this year or a
 *     prepaid future year), OR
 *   - legacy (no `cotisationYear`): reference date (paymentDate ?? creationDate)
 *     on or after `legacyCutoff` (now − 1 year), the old rolling rule.
 *
 * This module stays Prisma-free, so callers assemble the filter themselves
 * (see app/admin/users/[type]/page.tsx):
 *   const { currentYear, legacyCutoff } = cotisationCoverageQuery();
 *   const match = { type: 'COTISATION', isActive: true, OR: [
 *       { cotisationYear: { gte: currentYear } },
 *       { AND: [{ cotisationYear: null }, { OR: [
 *           { paymentDate: { gte: legacyCutoff } },
 *           { AND: [{ paymentDate: null }, { creationDate: { gte: legacyCutoff } }] },
 *       ] }] },
 *   ] };
 */
export function cotisationCoverageQuery(now: Date = new Date()): {
    currentYear: number;
    legacyCutoff: Date;
} {
    const legacyCutoff = new Date(now);
    legacyCutoff.setFullYear(legacyCutoff.getFullYear() - 1);
    return { currentYear: now.getFullYear(), legacyCutoff };
}

/** Shared French date formatter so the form and the dossier render expiry
 *  identically. */
export function formatCotisationDate(date: Date | string | null | undefined): string {
    const d = toDate(date ?? null);
    if (!d) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(d);
}
