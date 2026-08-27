// lib/billing.ts
import { Prisma, OrderBillingStatus, BillingStatus, BillEventType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getBillingStatusLabel } from '@/lib/billing-enums';
import { STATUS, type GuardResult } from '@/lib/statusSync';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recompute a bill's invoiceAmount from the sum of its active linked orders' costs.
 * Single source of truth for the bill total — call inside the same transaction as
 * whatever changed an order's cost or a bill's order membership.
 */
export async function recomputeBillTotal(
    tx: TransactionClient,
    billId: number
): Promise<Prisma.Decimal> {
    const linked = await tx.orders.findMany({
        where: { billId, isActive: true },
        select: { cost: true },
    });
    const total = linked.reduce(
        (sum, o) => sum.plus(o.cost ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0)
    );
    await tx.bill.update({ where: { id: billId }, data: { invoiceAmount: total } });
    return total;
}

/**
 * Append an immutable audit entry to a bill's history. Call inside a transaction so
 * the event and the state change it describes commit together.
 */
export async function logBillEvent(
    tx: TransactionClient,
    params: {
        billId: number;
        type: BillEventType;
        fromState?: BillingStatus | null;
        toState?: BillingStatus | null;
        payload?: Prisma.InputJsonValue | null;
        performedById?: number | null;
    }
): Promise<void> {
    await tx.billEvent.create({
        data: {
            billId: params.billId,
            type: params.type,
            fromState: params.fromState ?? null,
            toState: params.toState ?? null,
            payload: params.payload ?? Prisma.JsonNull,
            performedById: params.performedById ?? null,
        },
    });
}

/** Maps a bill state transition to its audit event type (null if not worth logging). */
export function transitionEventType(
    from: BillingStatus | string,
    to: BillingStatus | string
): BillEventType | null {
    if (from === BillingStatus.DRAFT && to === BillingStatus.BILLED) return BillEventType.ISSUED;
    if (from === BillingStatus.BILLED && to === BillingStatus.DRAFT) return BillEventType.REOPENED;
    if (to === BillingStatus.PAID) return BillEventType.PAID;
    if (to === BillingStatus.SOLDE) return BillEventType.SETTLED;
    return null;
}

/**
 * One open brouillon per client: reuse the most recent active DRAFT, or create one.
 * This is the single grouping point — both accrual and any manual bill creation
 * should route through here so a client never ends up with parallel open drafts.
 */
export async function getOrCreateOpenDraft(
    tx: TransactionClient,
    clientId: number,
    performedById: number | null = null
): Promise<{ id: number }> {
    const existing = await tx.bill.findFirst({
        where: { clientId, state: BillingStatus.DRAFT, isActive: true },
        orderBy: { creationDate: 'desc' },
        select: { id: true },
    });
    if (existing) return existing;

    const bill = await tx.bill.create({
        data: {
            clientId,
            state: BillingStatus.DRAFT,
            creationDate: new Date(),
            invoiceAmount: new Prisma.Decimal(0),
            isActive: true,
        },
        select: { id: true },
    });
    await logBillEvent(tx, {
        billId: bill.id,
        type: BillEventType.CREATED,
        toState: BillingStatus.DRAFT,
        performedById,
    });
    return bill;
}

/**
 * Attaches an order to the client's open DRAFT (creating one if needed), recomputing
 * the total off whatever cost is on the order right now. No-op if the order is already
 * on a bill, is UNBILLABLE, or is inactive.
 *
 * Callers gate this on the order reaching (or already sitting at) « Terminé » — a
 * demande is only billed once the service is rendered, so its price has had a chance
 * to be finalized first. Don't call this at order creation.
 */
export async function accrueOrderToOpenDraft(
    tx: TransactionClient,
    orderId: number,
    performedById: number | null = null
): Promise<{ billId: number } | null> {
    const order = await tx.orders.findUnique({
        where: { id: orderId },
        select: { id: true, aveugleId: true, billId: true, isActive: true, billingStatus: true },
    });
    if (!order || !order.isActive || order.billId != null) return null;
    if (order.billingStatus === OrderBillingStatus.UNBILLABLE) return null;

    const draft = await getOrCreateOpenDraft(tx, order.aveugleId, performedById);
    await tx.orders.update({
        where: { id: order.id },
        data: { billId: draft.id, billingStatus: OrderBillingStatus.UNBILLED },
    });
    await recomputeBillTotal(tx, draft.id);
    await logBillEvent(tx, {
        billId: draft.id,
        type: BillEventType.ORDER_ATTACHED,
        payload: { orderId: order.id, reason: 'accrual' },
        performedById,
    });
    return { billId: draft.id };
}

/**
 * When the client's open DRAFT reaches their paymentThreshold (seuil), issue it:
 * DRAFT -> BILLED, and its orders UNBILLED -> BILLED. The next order for the client
 * will open a fresh DRAFT via getOrCreateOpenDraft. Returns null if nothing issued.
 */
export async function issueDraftIfOverThreshold(
    tx: TransactionClient,
    clientId: number,
    performedById: number | null = null
): Promise<{ billId: number; total: number } | null> {
    const user = await tx.user.findUnique({
        where: { id: clientId },
        select: { paymentThreshold: true },
    });
    const threshold = user?.paymentThreshold != null ? Number(user.paymentThreshold) : null;
    if (threshold == null || threshold <= 0) return null;

    const draft = await tx.bill.findFirst({
        where: { clientId, state: BillingStatus.DRAFT, isActive: true },
        orderBy: { creationDate: 'desc' },
        select: { id: true },
    });
    if (!draft) return null;

    const total = await recomputeBillTotal(tx, draft.id);
    if (Number(total) < threshold) return null;

    await tx.bill.update({
        where: { id: draft.id },
        data: { state: BillingStatus.BILLED, issueDate: new Date() },
    });
    await tx.orders.updateMany({
        where: {
            billId: draft.id,
            isActive: true,
            billingStatus: { not: OrderBillingStatus.UNBILLABLE },
        },
        data: { billingStatus: OrderBillingStatus.BILLED },
    });
    await logBillEvent(tx, {
        billId: draft.id,
        type: BillEventType.ISSUED,
        fromState: BillingStatus.DRAFT,
        toState: BillingStatus.BILLED,
        performedById,
    });
    return { billId: draft.id, total: Number(total) };
}

/**
 * Order fields printed on the invoice (BillPDF): book, date, type, cost.
 * Changing any of these on an order attached to a non-DRAFT bill makes the issued
 * document stale and should warn the admin to reprint.
 *
 * La date imprimée est la date de clôture — le jour de l'expédition à l'auditeur
 * — et non la date de réception de la demande, qui ne figure plus sur le papier.
 */
export const INVOICE_VISIBLE_ORDER_FIELDS = [
    'catalogueId',
    'closureDate',
    'isDuplication',
    'cost',
] as const;

/** An order is BILLED once its bill is issued (anything past DRAFT); a draft (brouillon) leaves it UNBILLED. */
export const orderBillingForBillState = (state: string): 'BILLED' | 'UNBILLED' =>
    state === 'DRAFT' ? 'UNBILLED' : 'BILLED';
// ── Ce qu'une facture verrouille sur ses demandes ────────────────────────────
/**
 * Le verrou ne se déclenche PAS au rattachement.
 *
 * Une demande rejoint le brouillon de son auditeur toute seule, à la seconde où
 * un permanent la passe « Terminé » (accrueOrderToOpenDraft). Verrouiller sur le
 * rattachement reviendrait donc à figer la demande au moment même où on la
 * termine, sur un document que personne n'a jamais vu. La frontière qui compte
 * est l'ÉMISSION : le papier est parti chez l'auditeur, et une base qui le
 * contredit devient un vrai problème. C'est la ligne que trace déjà
 * ADJUSTABLE_ORDER_WHERE pour la retarification automatique — une seule
 * définition de « encore modifiable », pas deux.
 *
 * Deux champs font exception et sont verrouillés dès le brouillon, parce qu'ils
 * ne rendent pas le document périmé mais FAUX sur qui doit quoi :
 *
 *   - l'auditeur, qui décide de quelle facture la demande relève. addOrder
 *     refuse déjà d'attacher une demande dont l'aveugleId ≠ bill.clientId ; sans
 *     le garde ci-dessous, une modification de la demande rouvrait la porte
 *     par-derrière et la facture facturait une personne pour le livre d'une
 *     autre ;
 *   - « Non facturable », qui prétend sortir du cycle une ligne que
 *     recomputeBillTotal continue de sommer (il compte par billId, pas par
 *     billingStatus).
 *
 * Le retour en arrière du statut, lui, suit la frontière normale : sur un
 * brouillon la demande se détache toute seule — le miroir exact de l'accrual —
 * et sur une facture émise il est refusé.
 */

const billFail = (httpStatus: number, message: string): GuardResult => ({
    ok: false,
    httpStatus,
    message,
});

/** Une facture émise a été imprimée et envoyée ; un brouillon n'a jamais quitté ECA. */
const billIsIssued = (billState: BillingStatus | null): boolean =>
    billState != null && billState !== BillingStatus.DRAFT;

/** « la facture #12 (émise) » — l'état vient toujours de la même table de libellés. */
const billRef = (billId: number, billState: BillingStatus | null): string =>
    billState
        ? `la facture #${billId} (${getBillingStatusLabel(billState).toLowerCase()})`
        : `la facture #${billId}`;

/**
 * Le chemin de sortie, toujours donné avec le refus : un verrou sans issue est un
 * cul-de-sac. `purpose` nomme ce que le permanent essayait de faire, sinon tous
 * les refus se terminent par un « pour la modifier » qui ne dit rien.
 */
const detachAdvice = (billId: number, billState: BillingStatus | null, purpose: string): string =>
    billIsIssued(billState)
        ? `Rouvrez la facture #${billId} et retirez-en la demande pour ${purpose}.`
        : `Retirez la demande de la facture #${billId} pour ${purpose}.`;

/**
 * L'auditeur d'une demande rattachée à une facture ne bouge pas — voir la note
 * ci-dessus : c'est lui qui détermine à quelle facture elle appartient.
 */
export function guardOrderClientOnBill(args: {
    changingClient: boolean;
    billId: number | null;
    billState: BillingStatus | null;
}): GuardResult {
    const { changingClient, billId, billState } = args;
    if (!changingClient || billId == null) return { ok: true };
    return billFail(
        409,
        `L'auditeur ne peut pas être modifié : la demande figure sur ${billRef(billId, billState)}, ` +
            `qui appartient à l'auditeur actuel. ${detachAdvice(billId, billState, "en changer l'auditeur")}`
    );
}

/**
 * « Non facturable » sur une demande rattachée : le total continuerait de la
 * compter. Refusé sur un brouillon comme sur une facture émise.
 */
export function guardOrderUnbillableOnBill(args: {
    settingUnbillable: boolean;
    billId: number | null;
    billState: BillingStatus | null;
}): GuardResult {
    const { settingUnbillable, billId, billState } = args;
    if (!settingUnbillable || billId == null) return { ok: true };
    return billFail(
        409,
        `Une demande rattachée à une facture ne peut pas être marquée « Non facturable » : ` +
            `elle figure sur ${billRef(billId, billState)} et son montant y est compté. ` +
            detachAdvice(billId, billState, 'la sortir du cycle de facturation')
    );
}

/** La demande quitte « Terminé » — l'état qui l'avait fait rejoindre une facture. */
export function leavesTermine(previousStatusId: number, nextStatusId: number): boolean {
    return previousStatusId === STATUS.TERMINE && nextStatusId !== STATUS.TERMINE;
}

/**
 * Rouvrir une demande déjà partie sur une facture émise. Refusé : le document
 * annonce une prestation rendue. Sur un brouillon, l'appelant détache au lieu de
 * refuser (detachOrderFromBill) — d'où le `ok` renvoyé ici dans ce cas.
 */
export function guardOrderLeavingTermineOnBill(args: {
    previousStatusId: number;
    nextStatusId: number;
    billId: number | null;
    billState: BillingStatus | null;
}): GuardResult {
    const { previousStatusId, nextStatusId, billId, billState } = args;
    if (billId == null || !leavesTermine(previousStatusId, nextStatusId)) return { ok: true };
    if (!billIsIssued(billState)) return { ok: true };
    return billFail(
        409,
        `Le statut ne peut pas revenir en arrière : la demande figure sur ${billRef(billId, billState)}, ` +
            `déjà envoyée à l'auditeur. ${detachAdvice(billId, billState, 'la rouvrir')}`
    );
}

/**
 * Détache une demande de sa facture et remet son état de facturation à zéro.
 *
 * Le miroir de accrueOrderToOpenDraft : ce qu'une entrée en « Terminé » attache,
 * une sortie de « Terminé » le retire, tant que la facture est un brouillon.
 * Jamais laisser une demande « Facturé » sans billId — c'est l'état perdu que
 * removeOrder évite déjà. Renvoie le nouveau total du brouillon.
 */
export async function detachOrderFromBill(
    tx: TransactionClient,
    args: { orderId: number; billId: number; reason: string; performedById?: number | null }
): Promise<Prisma.Decimal> {
    const { orderId, billId, reason, performedById } = args;
    await tx.orders.update({
        where: { id: orderId, billId },
        data: { billId: null, billingStatus: OrderBillingStatus.UNBILLED },
    });
    const total = await recomputeBillTotal(tx, billId);
    await logBillEvent(tx, {
        billId,
        type: BillEventType.ORDER_DETACHED,
        payload: { orderId, reason, newTotal: total.toString() },
        performedById: performedById ?? null,
    });
    return total;
}
