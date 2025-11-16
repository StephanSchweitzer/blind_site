import { Prisma, DeliveryMethod, BillingStatus } from '@prisma/client';
import { z } from 'zod';

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
    'all'
]);
export type OrderIncludeRelation = z.infer<typeof OrderIncludeRelationSchema>;

// ============================================================================
// Select Configuration Types (for each mode)
// ============================================================================

export const basicOrderSelect = {
    id: true,
    aveugleId: true,
    catalogueId: true,
    requestReceivedDate: true,
    statusId: true,
    deliveryMethod: true,
    billingStatus: true,
    closureDate: true,
} as const satisfies Prisma.OrdersSelect;

export const detailedOrderSelect = {
    id: true,
    aveugleId: true,
    catalogueId: true,
    requestReceivedDate: true,
    statusId: true,
    isDuplication: true,
    mediaFormatId: true,
    deliveryMethod: true,
    processedByStaffId: true,
    createdDate: true,
    closureDate: true,
    cost: true,
    billingStatus: true,
    billId: true,
    lentPhysicalBook: true,
    notes: true,
    updatedAt: true,
} as const satisfies Prisma.OrdersSelect;

// ============================================================================
// Include Configuration Builder
// ============================================================================

export type OrderIncludeConfig = {
    aveugle?: boolean | Prisma.UserDefaultArgs;
    catalogue?: boolean | Prisma.BookDefaultArgs;
    status?: boolean | Prisma.StatusDefaultArgs;
    mediaFormat?: boolean | Prisma.MediaFormatDefaultArgs;
    processedByStaff?: boolean | Prisma.UserDefaultArgs;
    bill?: boolean | Prisma.BillDefaultArgs;
    assignments?: boolean | Prisma.AssignmentFindManyArgs;
};

// Pre-configured includes for each relation type
export const orderIncludeConfigs = {
    aveugle: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    catalogue: {
        select: {
            id: true,
            title: true,
            author: true,
            isbn: true,
            readingDurationMinutes: true,
        },
    } satisfies Prisma.BookDefaultArgs,

    status: {
        select: {
            id: true,
            name: true,
            description: true,
        },
    } satisfies Prisma.StatusDefaultArgs,

    mediaFormat: {
        select: {
            id: true,
            name: true,
            description: true,
        },
    } satisfies Prisma.MediaFormatDefaultArgs,

    processedByStaff: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    bill: {
        select: {
            id: true,
            issueDate: true,
            invoiceAmount: true,
        },
    } satisfies Prisma.BillDefaultArgs,

    assignments: {
        include: {
            reader: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
            status: {
                select: {
                    name: true,
                },
            },
        },
        orderBy: {
            id: 'desc' as const,
        },
    } satisfies Prisma.AssignmentFindManyArgs,

    all: {
        aveugle: {
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
            },
        },
        catalogue: {
            select: {
                id: true,
                title: true,
                author: true,
                isbn: true,
            },
        },
        status: {
            select: {
                id: true,
                name: true,
            },
        },
        mediaFormat: {
            select: {
                id: true,
                name: true,
            },
        },
        processedByStaff: {
            select: {
                id: true,
                name: true,
            },
        },
        bill: true,
        assignments: {
            include: {
                reader: {
                    select: {
                        name: true,
                    },
                },
            },
        },
    },
} as const;

// ============================================================================
// Response Types
// ============================================================================

// Basic mode response
export type BasicOrderResponse = Prisma.OrdersGetPayload<{
    select: typeof basicOrderSelect;
}>;

// Detailed mode response
export type DetailedOrderResponse = Prisma.OrdersGetPayload<{
    select: typeof detailedOrderSelect;
}>;

// Full mode response with optional includes
export type FullOrderResponse = Prisma.OrdersGetPayload<{
    include: OrderIncludeConfig;
}>;

// ============================================================================
// Create/Update Input Types
// ============================================================================

export const OrderCreateInputSchema = z.object({
    aveugleId: z.number(),
    catalogueId: z.number(),
    requestReceivedDate: z.string().datetime(),
    statusId: z.number(),
    isDuplication: z.boolean(),
    mediaFormatId: z.number(),
    deliveryMethod: z.nativeEnum(DeliveryMethod),
    processedByStaffId: z.number().optional().nullable(),
    createdDate: z.string().datetime().optional().nullable(),
    closureDate: z.string().datetime().optional().nullable(),
    cost: z.number().or(z.string()).optional().nullable(),
    billingStatus: z.nativeEnum(BillingStatus).optional(),
    billId: z.number().optional().nullable(),
    lentPhysicalBook: z.boolean(),
    notes: z.string().optional().nullable(),
});

export type OrderCreateInput = z.infer<typeof OrderCreateInputSchema>;

export const OrderUpdateInputSchema = z.object({
    aveugleId: z.number().optional(),
    catalogueId: z.number().optional(),
    requestReceivedDate: z.string().datetime().optional(),
    statusId: z.number().optional(),
    isDuplication: z.boolean().optional(),
    mediaFormatId: z.number().optional(),
    deliveryMethod: z.nativeEnum(DeliveryMethod).optional(),
    processedByStaffId: z.number().optional().nullable(),
    createdDate: z.string().datetime().optional().nullable(),
    closureDate: z.string().datetime().optional().nullable(),
    cost: z.number().or(z.string()).optional().nullable(),
    billingStatus: z.nativeEnum(BillingStatus).optional(),
    billId: z.number().optional().nullable(),
    lentPhysicalBook: z.boolean().optional(),
    notes: z.string().optional().nullable(),
});

export type OrderUpdateInput = z.infer<typeof OrderUpdateInputSchema>;

// Prisma create data type
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

// Prisma update data type
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

// ============================================================================
// Helper Types
// ============================================================================

export type OrderWithAllRelations = Prisma.OrdersGetPayload<{
    include: {
        aveugle: true;
        catalogue: true;
        status: true;
        mediaFormat: true;
        processedByStaff: true;
        bill: true;
        assignments: true;
    };
}>;