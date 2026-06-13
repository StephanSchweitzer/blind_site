import type { Prisma } from '@prisma/client';

/**
 * Workflow statuses (shared Status lookup table).
 * Only TERMINE and SOLDE carry special meaning in the sync logic:
 * an assignment tops out at TERMINE; SOLDE is order-only.
 */
export const STATUS = {
    ATTENTE: 1, // Attente envoi vers lecteur
    EN_COURS: 2, // En cours
    TERMINE: 3, // Terminé
    SOLDE: 4, // Soldé
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

/** An assignment can never hold the SOLDE status. */
export function guardAssignmentStatus(statusId: number): GuardResult {
    if (statusId === STATUS.SOLDE) {
        return fail(
            400,
            'Une affectation ne peut pas avoir le statut « Soldé » : ce statut est réservé aux commandes.'
        );
    }
    return OK;
}

/** Duplication orders never receive an assignment. */
export function guardNotDuplication(isDuplication: boolean): GuardResult {
    if (isDuplication) {
        return fail(
            409,
            "Cette commande est une duplication : son statut se gère directement sur la commande, sans affectation."
        );
    }
    return OK;
}

/** One-assignment-per-order, enforced at the API layer for new assignments. */
export function guardOrderHasNoAssignment(assignmentCount: number): GuardResult {
    if (assignmentCount >= 1) {
        return fail(
            409,
            "Cette commande possède déjà une affectation. Une commande ne peut en avoir qu'une seule."
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
            "La commande associée est soldée : l'affectation est verrouillée et ne peut plus être modifiée."
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
            "Impossible de solder la commande : l'enregistrement n'est pas terminé. L'affectation doit d'abord être au statut « Terminé »."
        );
    }
    return OK;
}

export async function syncOrderToStatus(
    tx: Prisma.TransactionClient,
    orderId: number,
    statusId: number
): Promise<void> {
    await tx.orders.update({ where: { id: orderId }, data: { statusId } });
}

export async function syncAssignmentToStatus(
    tx: Prisma.TransactionClient,
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
                return fail(400, "En « Attente envoi vers lecteur », l'affectation ne peut pas avoir de date d'envoi ni de date de retour. Passez-la « En cours » si le livre a été envoyé.");
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
                return fail(400, "Une affectation « En cours » ne peut pas avoir de date de retour. Passez-la « Terminé » si le livre est revenu à l'ECA.");
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
                return fail(400, "Le statut « Terminé » nécessite une date de retour à l'ECA.");
            }
            return OK;
        case STATUS.SOLDE:
            return fail(400, "Une affectation ne peut pas avoir le statut « Soldé ».");
        default:
            return OK;
    }
}

/** A linked assignment must be for the same book (catalogue entry) as its order. */
export function guardAssignmentMatchesOrder(
    assignmentCatalogueId: number,
    orderCatalogueId: number
): GuardResult {
    if (assignmentCatalogueId !== orderCatalogueId) {
        return fail(
            409,
            "Le livre de l'affectation ne correspond pas au livre de la commande liée."
        );
    }
    return OK;
}

/** An order with an assignment can't be flipped to a duplication (duplications have no assignment). */
export function guardDuplicationFlip(setToDuplication: boolean, hasAssignment: boolean): GuardResult {
    if (setToDuplication && hasAssignment) {
        return fail(
            409,
            "Impossible de marquer cette commande comme duplication : elle possède déjà une affectation. Supprimez l'affectation d'abord."
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
            "Cette commande nécessite un enregistrement : créez et terminez l'affectation avant de la passer « Terminé » ou « Soldé »."
        );
    }
    if (args.assignmentStatusId !== STATUS.TERMINE) {
        return fail(
            409,
            "L'affectation correspondante n'est pas terminée. Elle doit être au statut « Terminé » avant de clôturer la commande."
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