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
 * the event and the state change it describes commit together — and always AFTER
 * whatever statement in that same transaction last touched invoiceAmount, since
 * this reads it back to stamp the event with the total as of right now. That
 * total is what the journal des modifications shows for this event from then on:
 * invoiceAmount itself is excluded from the audit diff (DERIVED_FIELDS in
 * lib/audit/config.ts) because BillEvent is meant to be the bill's real history —
 * so this is the one place its value over time actually survives.
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
    const bill = await tx.bill.findUnique({
        where: { id: params.billId },
        select: { invoiceAmount: true },
    });
    await tx.billEvent.create({
        data: {
            billId: params.billId,
            type: params.type,
            fromState: params.fromState ?? null,
            toState: params.toState ?? null,
            payload: params.payload ?? Prisma.JsonNull,
            performedById: params.performedById ?? null,
            amountAtEvent: bill?.invoiceAmount ?? null,
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
        where: ordersFollowingBillState(draft.id),
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
 * Les demandes d'une facture dont le statut de facturation SUIT l'état de la
 * facture — c'est-à-dire toutes sauf deux catégories.
 *
 * « Non facturable » sort du cycle : la marquer « Facturé » parce que sa facture
 * vient d'être émise reviendrait à défaire à la main la décision d'un permanent.
 * Une demande désactivée n'est plus comptée nulle part (recomputeBillTotal
 * l'exclut déjà) et n'a donc pas à être réécrite non plus.
 *
 * issueDraftIfOverThreshold traçait déjà cette frontière ; les transitions
 * d'état de la facture (app/api/bills/[id]) l'ignoraient et écrasaient les deux.
 * Une seule définition, partagée, pour que les deux chemins écrivent la même
 * chose.
 */
export const ordersFollowingBillState = (billId: number): Prisma.OrdersWhereInput => ({
    billId,
    isActive: true,
    billingStatus: { not: OrderBillingStatus.UNBILLABLE },
});

/**
 * Le statut de facturation d'une demande qu'on DÉTACHE.
 *
 * Le miroir de ordersFollowingBillState : ce qui ne suit pas l'état de la
 * facture en y entrant ne le suit pas davantage en en sortant.
 *
 * « Non facturable » est une décision, pas un état de facturation. La remettre
 * « Non facturé » en la détachant la replace dans le cycle — elle redevient
 * retarifable par repriceOpenOrdersForBook (ADJUSTABLE_ORDER_WHERE) et se
 * rattachera au prochain brouillon de l'auditeur — c'est-à-dire exactement ce
 * dont un permanent l'avait sortie. Les quatre chemins de détachement
 * l'écrasaient tous les quatre.
 *
 * « Non facturable » sans billId n'est PAS l'état perdu que ces chemins
 * évitent : l'état perdu est « Facturé » sans facture. C'est au contraire l'état
 * NORMAL d'une demande hors cycle.
 */
export const detachedBillingStatus = (
    current: OrderBillingStatus
): OrderBillingStatus =>
    current === OrderBillingStatus.UNBILLABLE
        ? OrderBillingStatus.UNBILLABLE
        : OrderBillingStatus.UNBILLED;

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

/**
 * Le statut de facturation d'une demande rattachée est DÉRIVÉ de l'état de sa
 * facture — il ne se saisit pas.
 *
 * `guardOrderUnbillableOnBill` ci-dessus ne ferme qu'une des trois valeurs, et
 * « Facturé » est déjà refusé sur une demande sans facture. Restait « Non
 * facturé », accepté tel quel sur une demande rattachée à une facture émise :
 * la ligne continuait d'être comptée par recomputeBillTotal (qui somme par
 * billId, jamais par billingStatus) tout en s'annonçant non facturée partout où
 * un permanent la lit. C'est l'état « perdu » que removeOrder et
 * detachOrderFromBill prennent soin d'éviter, à l'envers.
 *
 * La valeur juste est celle qu'écrivent déjà toutes les transitions de facture :
 * orderBillingForBillState(bill.state). Toute autre est refusée tant que la
 * demande est rattachée — le chemin de sortie reste le détachement.
 */
export function guardOrderBillingStatusOnBill(args: {
    /** `undefined` = le champ n'est pas envoyé, donc rien à vérifier. */
    billingStatus: OrderBillingStatus | undefined;
    billId: number | null;
    billState: BillingStatus | null;
}): GuardResult {
    const { billingStatus, billId, billState } = args;
    if (billingStatus === undefined || billId == null || billState == null) return { ok: true };

    const expected = orderBillingForBillState(billState) as OrderBillingStatus;
    if (billingStatus === expected) return { ok: true };

    return billFail(
        409,
        `Le statut de facturation d'une demande rattachée suit sa facture et ne se saisit pas : ` +
            `elle figure sur ${billRef(billId, billState)}, donc « ${getBillingStatusLabel(billState)} » ` +
            `implique « ${expected === 'BILLED' ? 'Facturé' : 'Non facturé'} ». ` +
            detachAdvice(billId, billState, 'changer son statut de facturation')
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
    // Relu pour ne pas écraser « Non facturable » — voir detachedBillingStatus.
    const current = await tx.orders.findUnique({
        where: { id: orderId },
        select: { billingStatus: true },
    });
    await tx.orders.update({
        where: { id: orderId, billId },
        data: {
            billId: null,
            billingStatus: detachedBillingStatus(
                current?.billingStatus ?? OrderBillingStatus.UNBILLED
            ),
        },
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
