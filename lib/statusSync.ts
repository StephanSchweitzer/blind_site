import { prisma } from '@/lib/prisma';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Workflow statuses (shared Status lookup table).
 * Only TERMINE and SOLDE carry special meaning in the sync logic:
 * an assignment tops out at TERMINE, and so does a demande.
 *
 * SOLDE is RETIRED as a workflow status: « Soldé » belongs to factures
 * (BillingStatus.SOLDE), not to demandes or attributions. It is kept here
 * because the Status row still exists and the guards below still have to
 * recognise it — but neither a demande nor an attribution may be set to it.
 * See guardOrderStatus / guardAssignmentStatus.
 *
 * A_FAIRE is DUPLICATION-ONLY. A duplication owns no attribution, so the
 * recording statuses say nothing true about it — « En cours » in particular
 * used to be set automatically and read as though the book were being
 * recorded. A duplication therefore has a two-state lifecycle,
 * « À faire » → « Terminé », enforced by guardDuplicationStatus.
 *
 * These ids are fixed, not discovered: the Status rows are reference data
 * inserted with explicit ids so dev and prod agree. Keep the seed's STATUSES
 * array in the same order.
 */
export const STATUS = {
    ATTENTE: 1, // Attente envoi vers lecteur
    EN_COURS: 2, // En cours
    TERMINE: 3, // Terminé
    SOLDE: 4, // Soldé — retired, facture-only (see above)
    A_FAIRE: 5, // À faire — duplications only (see above)
} as const;

export type GuardResult =
    | { ok: true }
    | { ok: false; httpStatus: number; message: string };

const OK: GuardResult = { ok: true };
const fail = (httpStatus: number, message: string): GuardResult => ({
    ok: false,
    httpStatus,
    message,
});

/** An assignment can never hold the SOLDE or A_FAIRE status. */
export function guardAssignmentStatus(statusId: number): GuardResult {
    if (statusId === STATUS.SOLDE) {
        return fail(
            400,
            'Une attribution ne peut pas avoir le statut « Soldé » : ce statut est réservé aux demandes.'
        );
    }
    if (statusId === STATUS.A_FAIRE) {
        return fail(
            400,
            'Une attribution ne peut pas avoir le statut « À faire » : ce statut est réservé aux duplications.'
        );
    }
    return OK;
}

/**
 * « À faire » and the recording statuses are mutually exclusive.
 *
 * A duplication has no attribution, so it can only be « À faire » or « Terminé » —
 * « Attente envoi vers lecteur » and « En cours » both describe a book that is
 * with a lecteur, which a duplication never is. Conversely « À faire » is
 * duplication-only: a demande d'enregistrement starts at « Attente envoi vers
 * lecteur », which already means "à faire" *and* says what the action is.
 *
 * Rejects outright rather than grandfathering, matching guardOrderStatus's
 * handling of SOLDE. Safe because no duplication holds a recording status:
 * the team cleared « En cours » duplications before this shipped.
 */
export function guardDuplicationStatus(isDuplication: boolean, statusId: number): GuardResult {
    if (isDuplication) {
        if (statusId !== STATUS.A_FAIRE && statusId !== STATUS.TERMINE) {
            return fail(
                400,
                "Une duplication ne peut être qu'« À faire » ou « Terminé » : elle ne passe pas par un lecteur."
            );
        }
        return OK;
    }
    if (statusId === STATUS.A_FAIRE) {
        return fail(
            400,
            "« À faire » est réservé aux duplications. Une demande d'enregistrement commence en « Attente envoi vers lecteur »."
        );
    }
    return OK;
}

/**
 * A demande can never hold the SOLDE status either — « Soldé » is a facture
 * status. The pre-existing SOLDE guards below are kept intact for legacy rows
 * that may still carry it; this one stops any *new* demande from taking it.
 */
export function guardOrderStatus(statusId: number): GuardResult {
    if (statusId === STATUS.SOLDE) {
        return fail(
            400,
            'Une demande ne peut pas avoir le statut « Soldé » : ce statut est réservé aux factures.'
        );
    }
    return OK;
}

/** An attribution always belongs to a lecteur — it can't be created without one. */
export function guardAssignmentHasReader(hasReader: boolean): GuardResult {
    if (!hasReader) {
        return fail(
            400,
            "Une attribution doit être attribuée à un lecteur. Veuillez sélectionner un lecteur."
        );
    }
    return OK;
}

/** A finished assignment is locked for reassignment; it must be reopened first. */
export function guardCanReassignReader(
    assignmentStatusId: number | null | undefined
): GuardResult {
    if (assignmentStatusId === STATUS.TERMINE) {
        return fail(
            409,
            "Impossible d'assigner un nouveau lecteur : cette attribution est terminée. Rouvrez-la (statut « En cours ») avant d'assigner un autre lecteur."
        );
    }
    return OK;
}

/** Duplication orders never receive an assignment. */
export function guardNotDuplication(isDuplication: boolean): GuardResult {
    if (isDuplication) {
        return fail(
            409,
            "Cette demande est une duplication : son statut se gère directement sur la demande, sans attribution."
        );
    }
    return OK;
}

/** One-assignment-per-order, enforced at the API layer for new assignments. */
export function guardOrderHasNoAssignment(assignmentCount: number): GuardResult {
    if (assignmentCount >= 1) {
        return fail(
            409,
            "Cette demande possède déjà une attribution. Une demande ne peut en avoir qu'une seule."
        );
    }
    return OK;
}

/** A settled order locks its assignment. */
export function guardOrderNotSettled(
    orderStatusId: number | null | undefined
): GuardResult {
    if (orderStatusId === STATUS.SOLDE) {
        return fail(
            409,
            "La demande associée est soldée : l'attribution est verrouillée et ne peut plus être modifiée."
        );
    }
    return OK;
}

/** An order can only be set to SOLDE if it has no assignment or its assignment is at TERMINE. */
export function guardCanSettleOrder(
    assignmentStatusId: number | null
): GuardResult {
    if (assignmentStatusId !== null && assignmentStatusId !== STATUS.TERMINE) {
        return fail(
            409,
            "Impossible de solder la demande : l'enregistrement n'est pas terminé. L'attribution doit d'abord être au statut « Terminé »."
        );
    }
    return OK;
}

/** Local midnight today — closureDate is a calendar date, not a timestamp. */
function startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Derives a demande's date de clôture from its status instead of asking the
 * admin to type it: entering « Terminé » stamps today, leaving « Terminé »
 * clears the date again. Not a guard — it computes a value.
 *
 * An explicit non-null date always wins, so an admin can still correct the day,
 * and an explicit null on a demande that was ALREADY « Terminé » is honoured
 * (deliberate clearing). Returns `undefined` when nothing should change, which
 * Prisma treats as "leave this column alone" — that's what keeps the 19 000+
 * legacy « Terminé » demandes from being back-stamped with today's date on an
 * unrelated edit.
 *
 * Pass `previousStatusId: null` when creating.
 */
export function resolveClosureDate(args: {
    previousStatusId: number | null;
    nextStatusId: number | null;
    /** `undefined` = caller did not send the field; `null` = caller cleared it. */
    explicitClosureDate: Date | null | undefined;
}): Date | null | undefined {
    const { previousStatusId, nextStatusId, explicitClosureDate } = args;

    if (explicitClosureDate) return explicitClosureDate;

    const wasTermine = previousStatusId === STATUS.TERMINE;
    const isTermine = nextStatusId === STATUS.TERMINE;

    if (isTermine && !wasTermine) return startOfToday();
    if (wasTermine && !isTermine) return null;

    return explicitClosureDate;
}

/** Same local calendar day? closureDate is a date, not a timestamp (see startOfToday). */
function isSameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/**
 * A date de clôture only makes sense on a demande « Terminé » — it IS the day the
 * demande was closed. resolveClosureDate stamps it on entering « Terminé », but an
 * explicit date always wins there, so nothing stopped a date being put on an
 * « En cours » demande through the form or the API. This closes that direction.
 *
 * Rejects ONLY when the request actually sets or moves the date. The demandes
 * imported from Access carry whatever pair Access had, so an unrelated edit
 * (notes, coût…) that round-trips an ALREADY inconsistent date unchanged stays
 * allowed — a legacy row must not be held hostage by its history. Comparison is by
 * calendar day, so re-picking the same day through the date picker (local midnight)
 * doesn't read as a change against a stored timestamp.
 *
 * That escape hatch is deliberately narrow: it needs the demande to have been
 * non-« Terminé » ALREADY. A demande leaving « Terminé » can't keep its date by
 * re-sending it — that would break a consistent pair rather than preserve a broken one.
 *
 * Pass the RESULTING status, and `previousStatusId`/`previousClosureDate` as `null`
 * when creating.
 */
export function guardClosureDateRequiresTermine(args: {
    statusId: number;
    /** Resolved value: `undefined` = column untouched, `null` = cleared. */
    closureDate: Date | null | undefined;
    previousStatusId: number | null;
    previousClosureDate: Date | null;
}): GuardResult {
    const { statusId, closureDate, previousStatusId, previousClosureDate } = args;

    // Untouched or cleared — nothing being set, nothing to reject.
    if (!closureDate) return OK;
    if (statusId === STATUS.TERMINE) return OK;

    // An already-inconsistent legacy pair, re-saved as-is on the same day.
    if (
        previousStatusId !== null &&
        previousStatusId !== STATUS.TERMINE &&
        previousClosureDate &&
        isSameDay(closureDate, previousClosureDate)
    ) {
        return OK;
    }

    return fail(
        400,
        'Une date de clôture ne peut être renseignée que sur une demande « Terminé ». ' +
        'Passez la demande « Terminé » — la date est alors renseignée automatiquement.'
    );
}

/**
 * Pushes an attribution's status onto its demande — and the date de clôture that
 * goes with it.
 *
 * A demande is normally closed through its own route, which stamps the date via
 * resolveClosureDate. But an attribution passed « Terminé » closes its demande
 * from here instead, and this used to write nothing but `statusId` — leaving a
 * demande « Terminé » with no date de clôture, against the promise the form and
 * guardClosureDateRequiresTermine both make ("la date est alors renseignée
 * automatiquement").
 *
 * Nothing rejected that pair, which is what made it stick: resolveClosureDate
 * only acts on a crossing, so a demande already sitting on « Terminé » never got
 * its date filled in by a later edit either. The day it closed was simply lost,
 * for every demande ever closed through its attribution. Both paths now derive
 * the date the same way.
 *
 * The previous status is read here rather than passed in: this runs inside the
 * caller's transaction, and it is the *demande's* status — not the attribution's
 * — that decides whether the date is being stamped or cleared. The stored date
 * itself is never needed: when nothing is crossing the « Terminé » boundary the
 * column is left untouched, so whatever is already there survives on its own.
 *
 * No explicit date is ever supplied on this path: an attribution has no say over
 * *which* day the demande closed, only that it did. resolveClosureDate therefore
 * returns `undefined` whenever the demande isn't crossing into or out of
 * « Terminé », which Prisma reads as "leave this column alone" — that is what
 * keeps the 19 000+ legacy « Terminé » demandes from being back-stamped with
 * today's date when an attribution moves between two non-final statuses.
 *
 * The result needs no guardClosureDateRequiresTermine check: it is a date only
 * when the demande lands on « Terminé », and null when it leaves it.
 */
export async function syncOrderToStatus(
    tx: TransactionClient,
    orderId: number,
    statusId: number
): Promise<void> {
    const previous = await tx.orders.findUnique({
        where: { id: orderId },
        select: { statusId: true },
    });

    const closureDate = resolveClosureDate({
        previousStatusId: previous?.statusId ?? null,
        nextStatusId: statusId,
        explicitClosureDate: undefined,
    });

    await tx.orders.update({ where: { id: orderId }, data: { statusId, closureDate } });
}

export async function syncAssignmentToStatus(
    tx: TransactionClient,
    assignmentId: number,
    statusId: number
): Promise<void> {
    await tx.assignment.update({ where: { id: assignmentId }, data: { statusId } });
}

/**
 * Couples an assignment's status to its reader and dates (team rules, "rule #1"):
 *  - Attente envoi (1): reader optional, but NOT yet sent -> no send/return date.
 *  - En cours (2): reader required AND send date set (return date must be null).
 *  - Terminé (3): reader required AND send date AND return date set.
 *  - No reader therefore forces status 1 (statuses 2/3 fail the hasReader check).
 * Pass the RESULTING state (existing values merged with the incoming update).
 */
export function guardAssignmentConsistency(args: {
    statusId: number;
    hasReader: boolean;
    sentToReaderDate: Date | string | null | undefined;
    returnedToECADate: Date | string | null | undefined;
}): GuardResult {
    const sent = !!args.sentToReaderDate;
    const returned = !!args.returnedToECADate;

    switch (args.statusId) {
        case STATUS.ATTENTE:
            if (sent || returned) {
                return fail(400, "En « Attente envoi vers lecteur », l'attribution ne peut pas avoir de date d'envoi ni de date de retour. Passez-la « En cours » si le livre a été envoyé.");
            }
            return OK;
        case STATUS.EN_COURS:
            if (!args.hasReader) {
                return fail(400, "Le statut « En cours » nécessite un lecteur assigné.");
            }
            if (!sent) {
                return fail(400, "Le statut « En cours » nécessite une date d'envoi au lecteur.");
            }
            if (returned) {
                return fail(400, "Une attribution « En cours » ne peut pas avoir de date de retour. Passez-la « Terminé » si le livre est revenu aux ECA.");
            }
            return OK;
        case STATUS.TERMINE:
            if (!args.hasReader) {
                return fail(400, "Le statut « Terminé » nécessite un lecteur assigné.");
            }
            if (!sent) {
                return fail(400, "Le statut « Terminé » nécessite une date d'envoi au lecteur.");
            }
            if (!returned) {
                return fail(400, "Le statut « Terminé » nécessite une date de retour aux ECA.");
            }
            return OK;
        case STATUS.SOLDE:
            return fail(400, "Une attribution ne peut pas avoir le statut « Soldé ».");
        case STATUS.A_FAIRE:
            // Explicit, not left to `default` — falling through would silently
            // pass every reader/date rule below and let an attribution sit on a
            // duplication-only status with no consistency checks at all.
            return fail(400, "Une attribution ne peut pas avoir le statut « À faire » : ce statut est réservé aux duplications.");
        default:
            return OK;
    }
}

/**
 * Sync is asymmetric. An attribution owns its reader and its send/return dates;
 * the demande may only *reflect* a status onto the attribution when that status
 * stays consistent with those attribution-owned fields. It must never push the
 * attribution into a status that contradicts them (e.g. forcing « Attente envoi »
 * while a date d'envoi is set), which would strand/invalidate attribution data
 * through the demande side door. Callers reject the demande update and point the
 * user to the attribution for that transition.
 * Pass the RESULTING attribution state (incoming status + existing owned fields).
 */
export function guardDemandeStatusSync(args: {
    statusId: number;
    hasReader: boolean;
    sentToReaderDate: Date | string | null | undefined;
    returnedToECADate: Date | string | null | undefined;
}): GuardResult {
    // SOLDE is order-only and never propagates to the attribution — nothing to guard.
    if (args.statusId === STATUS.SOLDE) return OK;

    if (!guardAssignmentConsistency(args).ok) {
        return fail(
            409,
            "Ce changement de statut modifierait des données appartenant à l'attribution " +
            "(date d'envoi / date de retour). Gérez ce statut directement sur l'attribution."
        );
    }
    return OK;
}

/** A linked assignment must be for the same book (catalogue entry) as its order. */
export function guardAssignmentMatchesOrder(
    assignmentCatalogueId: number,
    orderCatalogueId: number
): GuardResult {
    if (assignmentCatalogueId !== orderCatalogueId) {
        return fail(
            409,
            "Le livre de l'attribution ne correspond pas au livre de la demande liée."
        );
    }
    return OK;
}

/** An order with an assignment can't be flipped to a duplication (duplications have no assignment). */
export function guardDuplicationFlip(setToDuplication: boolean, hasAssignment: boolean): GuardResult {
    if (setToDuplication && hasAssignment) {
        return fail(
            409,
            "Impossible de marquer cette demande comme duplication : elle possède déjà une attribution. Supprimez l'attribution d'abord."
        );
    }
    return OK;
}

/**
 * A NON-duplication order can only reach Terminé/Soldé once its assignment is Terminé.
 * Duplications need no assignment, so they're unaffected.
 */
export function guardOrderCompletion(args: {
    statusId: number;
    isDuplication: boolean;
    assignmentStatusId: number | null; // null = no assignment
}): GuardResult {
    const completing = args.statusId === STATUS.TERMINE || args.statusId === STATUS.SOLDE;
    if (!completing || args.isDuplication) return OK;

    if (args.assignmentStatusId === null) {
        return fail(
            409,
            "Cette demande nécessite un enregistrement : créez et terminez l'attribution avant de la passer « Terminé » ou « Soldé »."
        );
    }
    if (args.assignmentStatusId !== STATUS.TERMINE) {
        return fail(
            409,
            "L'attribution correspondante n'est pas terminée. Elle doit être au statut « Terminé » avant de clôturer la demande."
        );
    }
    return OK;
}

/** A reader can't be an auditeur (only lecteur / permanent may read). */
export function guardReaderEligible(memberType: string | null | undefined): GuardResult {
    if ((memberType ?? '').toLowerCase() === 'auditeur') {
        return fail(400, "Un auditeur ne peut pas être un lecteur.");
    }
    return OK;
}