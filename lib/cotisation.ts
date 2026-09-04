// Single source of truth for "is this member's cotisation up to date, and when
// does it expire?". Kept as a pure module (NO Prisma import) so it can be used
// from server components/routes AND 'use client' components alike — same reason
// lib/payment-enums.ts is defined locally.
//
// Callers must pass only ACTIVE payments of type COTISATION (isActive: true,
// type: 'COTISATION'). This helper does not know about Prisma or filtering.
//
// UNE COTISATION EXPIRE UN JOUR, PAS À UN INSTANT
//
// Tout ici se compte en JOURS du calendrier français, jamais en instants lus
// dans le fuseau de celui qui regarde. Ce module tourne des deux côtés — route
// serveur ET composant 'use client' — donc une frontière calculée en heure
// locale se déplace entre les deux : `new Date(y, 11, 31, 23, 59, 59)` vaut
// 23:59:59Z sur un serveur en UTC et 22:59:59Z dans un navigateur à Paris. Le
// 31 décembre entre 23 h et minuit, le serveur disait « à jour » et l'écran
// « expirée » — pour la même personne, au même moment.
//
// Les jours sont donc représentés comme le reste de l'application le fait :
// une Date à minuit UTC portant le jour du calendrier (voir
// lib/calendar-date.ts), et « aujourd'hui » vient de parisDayStart
// (lib/users/activityStatus.ts), qui sert déjà de frontière de journée aux
// indisponibilités et aux statistiques. Comparer deux minuits UTC ne dépend
// d'aucun fuseau.
import { parisDayStart } from '@/lib/users/activityStatus';

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

/**
 * Le 31 décembre d'une année, comme JOUR du calendrier (minuit UTC) : le
 * dernier jour couvert par une cotisation à l'année.
 *
 * Ce n'est plus un instant de fin de journée en heure locale — voir l'en-tête.
 * La comparaison qui en découle est jour contre jour (computeCotisationStatus),
 * si bien que le 31 décembre lui-même reste couvert jusqu'à son terme.
 */
function endOfYear(year: number): Date {
    return new Date(Date.UTC(year, 11, 31));
}

/** Le même jour, un an plus tard — la règle glissante des lignes héritées. */
function oneYearOn(day: Date): Date {
    return new Date(Date.UTC(day.getUTCFullYear() + 1, day.getUTCMonth(), day.getUTCDate()));
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
        // Le jour FRANÇAIS du paiement, pas celui du fuseau du lecteur : un
        // versement du 31 décembre à 23 h 30 à Paris est du 31 décembre, et son
        // année de couverture est celle-là, sur le serveur comme à l'écran.
        const refDay = parisDayStart(ref);
        return { expiresAt: oneYearOn(refDay), coverYear: refDay.getUTCFullYear(), ref };
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
    now: Date = new Date(),
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

    // Jour contre jour : « aujourd'hui » sur le calendrier français comparé au
    // dernier jour couvert. Les deux sont des minuits UTC, donc le résultat ne
    // dépend ni du fuseau du serveur ni de celui du navigateur — et le dernier
    // jour couvert l'est jusqu'au bout, ce qu'un `>= Date.now()` sur un jour
    // (et non plus sur une fin de journée) aurait cassé.
    const isPaid = parisDayStart(now).getTime() <= best.expiresAt.getTime();

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
    // Même calendrier que computeCotisationStatus, sans quoi la liste et la
    // pastille de la fiche se contrediraient un jour par an : l'année courante
    // est l'année FRANÇAISE, et le seuil hérité le jour français d'il y a un an.
    const today = parisDayStart(now);
    return {
        currentYear: today.getUTCFullYear(),
        legacyCutoff: new Date(
            Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), today.getUTCDate())
        ),
    };
}

/**
 * Member types that are never asked for a cotisation. A Donateur
 * (`bienfaiteur`) gives freely, so the portal must never report their
 * cotisation as missing or expired — no "Aucune cotisation enregistrée", no
 * "Cotisation non payée" badge. A cotisation that IS recorded on such a member
 * still shows as "à jour": exemption silences the nag, not the fact.
 */
export const COTISATION_EXEMPT_MEMBER_TYPES = ['bienfaiteur'] as const;

export function isCotisationExempt(memberType: string | null | undefined): boolean {
    return !!memberType && (COTISATION_EXEMPT_MEMBER_TYPES as readonly string[]).includes(memberType);
}

/** Shared French date formatter so the form and the dossier render expiry
 *  identically. */
export function formatCotisationDate(date: Date | string | null | undefined): string {
    const d = toDate(date ?? null);
    if (!d) return '—';
    // `timeZone: 'UTC'` parce que ce qu'on formate est un JOUR stocké à minuit
    // UTC, pas un instant : le relire dans le fuseau du lecteur affichait le
    // 30 décembre à l'ouest de Greenwich. Même règle que formatDay
    // (lib/users/activityStatus.ts) et que lib/calendar-date.ts.
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(d);
}
