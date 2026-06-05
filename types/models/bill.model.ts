import { Prisma, Bill } from '@prisma/client';

// ============================================================================
// Base Bill Model Type (from Prisma)
// ============================================================================

export type { Bill };

// ============================================================================
// Bill with Relations
// ============================================================================

export type BillWithClient = Prisma.BillGetPayload<{
    include: { client: true };
}>;

export type BillWithOrders = Prisma.BillGetPayload<{
    include: { orders: true };
}>;

export type BillWithAllRelations = Prisma.BillGetPayload<{
    include: {
        client: true;
        orders: true;
    };
}>;

// ============================================================================
// Bill Select Configurations
// ============================================================================

export const basicBillSelect = {
    id: true,
    clientId: true,
    state: true,
    creationDate: true,
    issueDate: true,
    invoiceAmount: true,
    isActive: true,
} as const satisfies Prisma.BillSelect;

export const detailedBillSelect = {
    id: true,
    clientId: true,
    state: true,
    creationDate: true,
    issueDate: true,
    paymentDate: true,
    invoiceAmount: true,
    isActive: true,
    deletedAt: true,
} as const satisfies Prisma.BillSelect;

// ============================================================================
// Bill Include Configurations
// ============================================================================

export const billSummaryInclude = {
    client: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    },
} as const;

export const billIncludeConfigs = {
    client: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    // The orders attached to this bill (line items of the invoice)
    orders: {
        select: {
            id: true,
            requestReceivedDate: true,
            cost: true,
            billingStatus: true,
            catalogue: {
                select: {
                    id: true,
                    title: true,
                    author: true,
                },
            },
        },
        orderBy: {
            requestReceivedDate: 'desc' as const,
        },
    } satisfies Prisma.Bill$ordersArgs,

    all: {
        client: {
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
            },
        },
        orders: {
            select: {
                id: true,
                requestReceivedDate: true,
                cost: true,
                billingStatus: true,
                catalogue: {
                    select: {
                        id: true,
                        title: true,
                        author: true,
                    },
                },
            },
            orderBy: {
                requestReceivedDate: 'desc' as const,
            },
        },
    },
} as const;