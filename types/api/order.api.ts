import { z } from 'zod';
import { Prisma, DeliveryMethod, BillingStatus } from '@prisma/client';
import {
    basicOrderSelect,
    detailedOrderSelect,
    orderIncludeConfigs,
    Orders,
} from '../models/order.model';

// ============================================================================
// Summary Types (for forms and UI components)
// ============================================================================

export type OrderSummary = Pick<Orders, 'id'>;
export type OrderBasicInfo = Pick<Orders, 'id' | 'requestReceivedDate' | 'statusId'>;


// ============================================================================
// Query Parameter Validators
// ============================================================================

export const OrderQueryModeSchema = z.enum(['basic', 'detailed', 'full']);
export type OrderQueryMode = z.infer<typeof OrderQueryModeSchema>;

export const OrderIncludeRelationSchema = z.enum([
    'aveugle',
    'catalogue',
    'status',
    'mediaFormat',
    'processedByStaff',
    'bill',
    'assignments',
    'all',
]);
export type OrderIncludeRelation = z.infer<typeof OrderIncludeRelationSchema>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicOrderResponse = Prisma.OrdersGetPayload<{
    select: typeof basicOrderSelect;
}>;

export type DetailedOrderResponse = Prisma.OrdersGetPayload<{
    select: typeof detailedOrderSelect;
}>;

export type OrderIncludeConfig = {
    aveugle?: boolean | Prisma.UserDefaultArgs;
    catalogue?: boolean | Prisma.BookDefaultArgs;
    status?: boolean | Prisma.StatusDefaultArgs;
    mediaFormat?: boolean | Prisma.MediaFormatDefaultArgs;
    processedByStaff?: boolean | Prisma.UserDefaultArgs;
    bill?: boolean | Prisma.BillDefaultArgs;
    assignments?: boolean | Prisma.AssignmentFindManyArgs;
};

export type FullOrderResponse = Prisma.OrdersGetPayload<{
    include: OrderIncludeConfig;
}>;

// ============================================================================
// Create Input Types
// ============================================================================

export const OrderCreateInputSchema = z.object({
    aveugleId: z.number().int().positive(),
    catalogueId: z.number().int().positive(),
    requestReceivedDate: z.string().datetime(),
    statusId: z.number().int().positive(),
    isDuplication: z.boolean(),
    mediaFormatId: z.number().int().positive(),
    deliveryMethod: z.nativeEnum(DeliveryMethod),
    processedByStaffId: z.number().int().positive().nullable().optional(),
    createdDate: z.string().datetime().nullable().optional(),
    closureDate: z.string().datetime().nullable().optional(),
    cost: z.number().or(z.string()).nullable().optional(),
    billingStatus: z.nativeEnum(BillingStatus).optional(),
    billId: z.number().int().positive().nullable().optional(),
    lentPhysicalBook: z.boolean(),
    notes: z.string().nullable().optional(),
});

export type OrderCreateInput = z.infer<typeof OrderCreateInputSchema>;

export type OrderCreateData = {
    aveugleId: number;
    catalogueId: number;
    requestReceivedDate: Date;
    statusId: number;
    isDuplication: boolean;
    mediaFormatId: number;
    deliveryMethod: DeliveryMethod;
    processedByStaffId?: number | null;
    createdDate?: Date | null;
    closureDate?: Date | null;
    cost?: number | null;
    billingStatus?: BillingStatus;
    billId?: number | null;
    lentPhysicalBook: boolean;
    notes?: string | null;
};

// ============================================================================
// Update Input Types
// ============================================================================

export const OrderUpdateInputSchema = z.object({
    aveugleId: z.number().int().positive().optional(),
    catalogueId: z.number().int().positive().optional(),
    requestReceivedDate: z.string().datetime().optional(),
    statusId: z.number().int().positive().optional(),
    isDuplication: z.boolean().optional(),
    mediaFormatId: z.number().int().positive().optional(),
    deliveryMethod: z.nativeEnum(DeliveryMethod).optional(),
    processedByStaffId: z.number().int().positive().nullable().optional(),
    createdDate: z.string().datetime().nullable().optional(),
    closureDate: z.string().datetime().nullable().optional(),
    cost: z.number().or(z.string()).nullable().optional(),
    billingStatus: z.nativeEnum(BillingStatus).optional(),
    billId: z.number().int().positive().nullable().optional(),
    lentPhysicalBook: z.boolean().optional(),
    notes: z.string().nullable().optional(),
});

export type OrderUpdateInput = z.infer<typeof OrderUpdateInputSchema>;

export type OrderUpdateData = {
    aveugleId?: number;
    catalogueId?: number;
    requestReceivedDate?: Date;
    statusId?: number;
    isDuplication?: boolean;
    mediaFormatId?: number;
    deliveryMethod?: DeliveryMethod;
    processedByStaffId?: number | null;
    createdDate?: Date | null;
    closureDate?: Date | null;
    cost?: number | null;
    billingStatus?: BillingStatus;
    billId?: number | null;
    lentPhysicalBook?: boolean;
    notes?: string | null;
};

// ============================================================================
// Filter/Query Types
// ============================================================================

export const OrderFilterSchema = z.object({
    aveugleId: z.number().optional(),
    catalogueId: z.number().optional(),
    statusId: z.number().optional(),
    billingStatus: z.nativeEnum(BillingStatus).optional(),
    deliveryMethod: z.nativeEnum(DeliveryMethod).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    isDuplication: z.boolean().optional(),
});

export type OrderFilter = z.infer<typeof OrderFilterSchema>;

// Export the include configs for use in API handlers
export { orderIncludeConfigs };