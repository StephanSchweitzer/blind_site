// lib/billing.ts
import { Prisma, OrderBillingStatus, BillingStatus, BillEventType } from '@prisma/client';

/**
 * Recompute a bill's invoiceAmount from the sum of its active linked orders' costs.
 * Single source of truth for the bill total — call inside the same transaction as
 * whatever changed an order's cost or a bill's order membership.
 */
export async function recomputeBillTotal(
    tx: Prisma.TransactionClient,
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
    tx: Prisma.TransactionClient,
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
    tx: Prisma.TransactionClient,
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
 * Invariant guarantee: a non-UNBILLABLE order must sit on a brouillon. Attaches the
 * order to the client's open DRAFT (creating one if needed). No-op if the order is
 * already on a bill, is UNBILLABLE, or is inactive — so it's safe to call on every
 * create/edit/completion.
 */
export async function accrueOrderToOpenDraft(
    tx: Prisma.TransactionClient,
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
    tx: Prisma.TransactionClient,
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
 */
export const INVOICE_VISIBLE_ORDER_FIELDS = [
    'catalogueId',
    'requestReceivedDate',
    'isDuplication',
    'cost',
] as const;