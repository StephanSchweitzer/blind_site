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
    /** Reference date of the most recent cotisation (paymentDate ?? creationDate). */
    latestPaymentDate: Date | null;
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
 * CURRENT RULE (intentionally simple): a cotisation grants a FULL year from its
 * reference date — expiresAt = referenceDate + 1 year. This is the single line
 * to change when the proration rule lands (e.g. calendar-year semantics where a
 * June payment only runs to 31 Dec, or cotisationYear-driven expiry). Nothing
 * downstream — the form banner or the dossier header — needs to change.
 */
export function computeCotisationStatus(
    payments: CotisationPaymentInput[],
): CotisationStatus {
    const dated = payments
        .map((p) => ({ p, ref: referenceDate(p) }))
        .filter((x): x is { p: CotisationPaymentInput; ref: Date } => x.ref !== null);

    if (dated.length === 0) {
        return { isPaid: false, expiresAt: null, coverYear: null, latestPaymentDate: null };
    }

    // Most recent cotisation wins.
    dated.sort((a, b) => b.ref.getTime() - a.ref.getTime());
    const { p: latest, ref } = dated[0];

    // ── Expiry rule — change HERE when proration is introduced ──────────────
    const expiresAt = new Date(ref);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    // ────────────────────────────────────────────────────────────────────────

    const isPaid = expiresAt.getTime() >= Date.now();
    const coverYear = latest.cotisationYear ?? ref.getFullYear();

    return { isPaid, expiresAt, coverYear, latestPaymentDate: ref };
}

/**
 * The reference-date cutoff for "à jour": with the current full-year rule, a
 * cotisation is up to date iff its reference date (paymentDate ?? creationDate)
 * is on or after (now − 1 year), since expiresAt = referenceDate + 1 year.
 *
 * This is the DB-query counterpart of the expiry rule in computeCotisationStatus
 * — keep the two in sync when proration lands. Callers turn this into a Prisma
 * `Payment` relation filter (see app/admin/users/[type]/page.tsx):
 *   payments: { some: { type: 'COTISATION', isActive: true, OR: [
 *       { paymentDate: { gte: cutoff } },
 *       { AND: [{ paymentDate: null }, { creationDate: { gte: cutoff } }] },
 *   ] } }
 */
export function cotisationReferenceCutoff(now: Date = new Date()): Date {
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    return cutoff;
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
