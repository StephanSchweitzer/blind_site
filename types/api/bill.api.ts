import { z } from 'zod';
import { Prisma, BillingStatus } from '@prisma/client';
import {
    basicBillSelect,
    detailedBillSelect,
    billIncludeConfigs,
    billSummaryInclude,
    Bill,
} from '../models/bill.model';

// ============================================================================
// Summary Types
// ============================================================================

export type BillSummary = Prisma.BillGetPayload<{
    select: {
        id: true;
        creationDate: true;
        invoiceAmount: true;
        state: true;
    };
    include: typeof billSummaryInclude;
}>;

export type BillBasicInfo = Pick<Bill, 'id' | 'state' | 'invoiceAmount'>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicBillResponse = Prisma.BillGetPayload<{
    select: typeof basicBillSelect;
}>;

export type DetailedBillResponse = Prisma.BillGetPayload<{
    select: typeof detailedBillSelect;
}>;

export type BillIncludeConfig = {
    client?: boolean | Prisma.UserDefaultArgs;
    orders?: boolean | Prisma.Bill$ordersArgs;
};

export type FullBillResponse = Prisma.BillGetPayload<{
    include: BillIncludeConfig;
}>;

// ============================================================================
// Create Input Types
// ============================================================================
// invoiceAmount is intentionally NOT accepted from the client — it is derived
// server-side by summing the cost of the attached orders (single source of truth).

export const BillCreateInputSchema = z.object({
    clientId: z.number().int().positive(),
    orderIds: z.array(z.number().int().positive()).min(1, 'Au moins une demande est requise'),
    state: z.nativeEnum(BillingStatus).optional(),
    creationDate: z.string().datetime().optional(),
    issueDate: z.string().datetime().nullable().optional(),
    paymentDate: z.string().datetime().nullable().optional(),
});

export type BillCreateInput = z.infer<typeof BillCreateInputSchema>;

export type BillCreateData = {
    clientId: number;
    state: BillingStatus;
    creationDate: Date;
    issueDate?: Date | null;
    paymentDate?: Date | null;
    invoiceAmount: Prisma.Decimal;
    isActive: boolean;
};

// ============================================================================
// Update Input Types
// ============================================================================

export const BillUpdateInputSchema = z.object({
    state: z.nativeEnum(BillingStatus).optional(),
    issueDate: z.string().datetime().nullable().optional(),
    paymentDate: z.string().datetime().nullable().optional(),
});

export type BillUpdateInput = z.infer<typeof BillUpdateInputSchema>;

// ============================================================================
// Filter Types
// ============================================================================

export const BillFilterSchema = z.object({
    clientId: z.number().optional(),
    state: z.nativeEnum(BillingStatus).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    isActive: z.boolean().optional(),
});

export type BillFilter = z.infer<typeof BillFilterSchema>;

export { billIncludeConfigs, billSummaryInclude };