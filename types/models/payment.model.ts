import { Prisma, Payment } from '@prisma/client';

// ============================================================================
// Base Payment Model Type (from Prisma)
// ============================================================================

export type { Payment };

// ============================================================================
// Payment with Relations
// ============================================================================

export type PaymentWithClient = Prisma.PaymentGetPayload<{
    include: { client: true };
}>;

export type PaymentWithBill = Prisma.PaymentGetPayload<{
    include: { bill: true };
}>;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{
    include: {
        client: true;
        bill: true;
    };
}>;

// ============================================================================
// Payment Select Configurations
// ============================================================================

export const basicPaymentSelect = {
    id: true,
    clientId: true,
    type: true,
    amount: true,
    paymentMethod: true,
    creationDate: true,
    paymentDate: true,
    billId: true,
} as const satisfies Prisma.PaymentSelect;

export const detailedPaymentSelect = {
    id: true,
    clientId: true,
    type: true,
    amount: true,
    paymentMethod: true,
    creationDate: true,
    issueDate: true,
    paymentDate: true,
    exportDate: true,
    importDate: true,
    receiptNumber: true,
    fiscalite: true,
    cotisationYear: true,
    comptable: true,
    isAllocated: true,
    allocationDate: true,
    observations: true,
    billId: true,
    sourceVenteId: true,
    sourceEcritureId: true,
    isActive: true,
} as const satisfies Prisma.PaymentSelect;

// ============================================================================
// Payment Include Configurations
// ============================================================================

export const paymentSummaryInclude = {
    client: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
        },
    },
    bill: {
        select: {
            id: true,
            invoiceAmount: true,
            state: true,
        },
    },
} as const;

export const paymentIncludeConfigs = {
    client: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    bill: {
        select: {
            id: true,
            invoiceAmount: true,
            state: true,
            issueDate: true,
        },
    } satisfies Prisma.BillDefaultArgs,

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
        bill: {
            select: {
                id: true,
                invoiceAmount: true,
                state: true,
                issueDate: true,
            },
        },
    },
} as const;

// ============================================================================
// Payments Table (list view) — shared shape for the admin payments page + table
// ============================================================================

export const paymentsTableInclude = {
    client: { select: { name: true, email: true } },
} as const satisfies Prisma.PaymentInclude;

type PaymentsTableRowRaw = Prisma.PaymentGetPayload<{ include: typeof paymentsTableInclude }>;

// JSON-safe row as sent to client components (Date -> ISO string, Decimal -> string)
export type SerializedPaymentTableRow = Omit<
    PaymentsTableRowRaw,
    'amount' | 'creationDate' | 'issueDate' | 'paymentDate' | 'exportDate' | 'importDate' | 'allocationDate' | 'deletedAt'
> & {
    amount: string;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
};

// Lightweight selection shapes consumed by the payment modal selectors
// (match the /api/user/search and /api/bills?clientId= payloads)
export type PaymentClientOption = { id: number; name: string | null; email: string };
export type PaymentBillOption = { id: number; invoiceAmount: string | number; state: string };