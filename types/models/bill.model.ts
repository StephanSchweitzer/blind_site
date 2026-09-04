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

    // The orders attached to this bill (line items of the invoice).
    //
    // `isActive` filtré explicitement : un include de relation échappe au filtre
    // soft-delete global (lib/prisma.ts), et recomputeBillTotal ne somme QUE les
    // demandes actives. Sans ce where, une demande supprimée continuait de
    // s'imprimer sur la facture en étant absente du total — des lignes qui
    // n'additionnent pas le montant annoncé. Même filtre que le total, pour que
    // les deux ne puissent pas diverger.
    orders: {
        where: { isActive: true },
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
            // Voir le commentaire sur `orders` ci-dessus : même filtre que
            // recomputeBillTotal, sinon les lignes et le total divergent.
            where: { isActive: true },
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
// ============================================================================
// Bills Table (list view) — shared shape for the admin bills page + table
// ============================================================================

export const billsTableInclude = {
    // firstName/lastName are what the row displays (getUserNameOnly); `name` is
    // the legacy column and only a fallback.
    client: { select: { name: true, email: true, firstName: true, lastName: true } },
} as const satisfies Prisma.BillInclude;

type BillsTableRowRaw = Prisma.BillGetPayload<{ include: typeof billsTableInclude }>;

// JSON-safe row as sent to client components (Date -> ISO string, Decimal -> string)
export type SerializedBillTableRow = Omit<
    BillsTableRowRaw,
    'invoiceAmount' | 'creationDate' | 'issueDate' | 'paymentDate'
> & {
    invoiceAmount: string;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
};