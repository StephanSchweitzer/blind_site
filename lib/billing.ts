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
 * When a client's unbilled solde reaches their paymentThreshold, sweep all of their
 * unbilled orders into a new DRAFT bill (brouillon) so the tab resets. The orders are
 * attached (billId set) but stay UNBILLED because the bill is a draft.
 * Solde = sum of cost where billId is null, active, and not UNBILLABLE.
 * Returns the created bill info, or null if nothing was created.
 */
export async function sweepIntoDraftBillIfOverThreshold(
    tx: Prisma.TransactionClient,
    aveugleId: number
): Promise<{ billId: number; total: number; orderCount: number } | null> {
    const user = await tx.user.findUnique({
        where: { id: aveugleId },
        select: { paymentThreshold: true },
    });

    const threshold = user?.paymentThreshold != null ? Number(user.paymentThreshold) : null;
    if (threshold == null || threshold <= 0) return null;

    const unbilled = await tx.orders.findMany({
        where: {
            aveugleId,
            billId: null,
            isActive: true,
            billingStatus: { not: OrderBillingStatus.UNBILLABLE },
        },
        select: { id: true, cost: true },
    });
    if (unbilled.length === 0) return null;

    const total = unbilled.reduce(
        (sum, o) => sum.plus(o.cost ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0)
    );
    if (Number(total) < threshold) return null;

    const bill = await tx.bill.create({
        data: {
            clientId: aveugleId,
            state: BillingStatus.DRAFT,
            creationDate: new Date(),
            issueDate: null,
            paymentDate: null,
            invoiceAmount: total,
            isActive: true,
        },
        select: { id: true },
    });

    await tx.orders.updateMany({
        where: { id: { in: unbilled.map((o) => o.id) } },
        data: { billId: bill.id, billingStatus: OrderBillingStatus.UNBILLED },
    });

    return { billId: bill.id, total: Number(total), orderCount: unbilled.length };
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