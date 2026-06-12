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