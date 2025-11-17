import { Prisma } from '@prisma/client';
import { z } from 'zod';

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const AssignmentQueryModeSchema = z.enum(['basic', 'detailed', 'full']);
export type AssignmentQueryMode = z.infer<typeof AssignmentQueryModeSchema>;

export const AssignmentIncludeRelationSchema = z.enum([
    'reader',
    'catalogue',
    'order',
    'status',
    'processedByStaff',
    'all'
]);
export type AssignmentIncludeRelation = z.infer<typeof AssignmentIncludeRelationSchema>;

// ============================================================================
// Select Configuration Types (for each mode)
// ============================================================================

export const basicAssignmentSelect = {
    id: true,
    readerId: true,
    catalogueId: true,
    orderId: true,
    statusId: true,
    receptionDate: true,
    sentToReaderDate: true,
    returnedToECADate: true,
} as const satisfies Prisma.AssignmentSelect;

export const detailedAssignmentSelect = {
    id: true,
    readerId: true,
    catalogueId: true,
    orderId: true,
    receptionDate: true,
    sentToReaderDate: true,
    returnedToECADate: true,
    statusId: true,
    notes: true,
    processedByStaffId: true,
} as const satisfies Prisma.AssignmentSelect;

// ============================================================================
// Include Configuration Builder
// ============================================================================

export type AssignmentIncludeConfig = {
    reader?: boolean | Prisma.UserDefaultArgs;
    catalogue?: boolean | Prisma.BookDefaultArgs;
    order?: boolean | Prisma.OrdersDefaultArgs;
    status?: boolean | Prisma.StatusDefaultArgs;
    processedByStaff?: boolean | Prisma.UserDefaultArgs;
};

// Pre-configured includes for each relation type
export const assignmentIncludeConfigs = {
    reader: {
        select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            specialization: true,
            isAvailable: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    catalogue: {
        select: {
            id: true,
            title: true,
            author: true,
            isbn: true,
            readingDurationMinutes: true,
            publisher: true,
        },
    } satisfies Prisma.BookDefaultArgs,

    order: {
        select: {
            id: true,
            requestReceivedDate: true,
            deliveryMethod: true,
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
                    title: true,
                    author: true,
                },
            },
            status: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    } satisfies Prisma.OrdersDefaultArgs,

    status: {
        select: {
            id: true,
            name: true,
            description: true,
        },
    } satisfies Prisma.StatusDefaultArgs,

    processedByStaff: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    all: {
        reader: {
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                specialization: true,
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
        order: {
            select: {
                id: true,
                requestReceivedDate: true,
                aveugle: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
                catalogue: {
                    select: {
                        title: true,
                        author: true,
                    },
                },
                status: {
                    select: {
                        name: true,
                    },
                },
            },
        },
        status: {
            select: {
                id: true,
                name: true,
                description: true,
                sortOrder: true,
            },
        },
        processedByStaff: {
            select: {
                id: true,
                name: true,
            },
        },
    },
} as const;

// ============================================================================
// Response Types
// ============================================================================

// Basic mode response
export type BasicAssignmentResponse = Prisma.AssignmentGetPayload<{
    select: typeof basicAssignmentSelect;
}>;

// Detailed mode response
export type DetailedAssignmentResponse = Prisma.AssignmentGetPayload<{
    select: typeof detailedAssignmentSelect;
}>;

// Full mode response with optional includes
export type FullAssignmentResponse = Prisma.AssignmentGetPayload<{
    include: AssignmentIncludeConfig;
}>;

// Specific type for assignmentIncludeConfigs.all
export type AssignmentWithAllIncludesResponse = Prisma.AssignmentGetPayload<{
    include: typeof assignmentIncludeConfigs.all;
}>;

// ============================================================================
// Create/Update Input Types
// ============================================================================

export const AssignmentCreateInputSchema = z.object({
    readerId: z.number(),
    catalogueId: z.number(),
    orderId: z.number().optional().nullable(),
    receptionDate: z.string().datetime().optional().nullable(),
    sentToReaderDate: z.string().datetime().optional().nullable(),
    returnedToECADate: z.string().datetime().optional().nullable(),
    statusId: z.number(),
    notes: z.string().optional().nullable(),
    processedByStaffId: z.number().optional().nullable(),
});

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateInputSchema>;

export const AssignmentUpdateInputSchema = z.object({
    readerId: z.number().optional(),
    catalogueId: z.number().optional(),
    orderId: z.number().optional().nullable(),
    receptionDate: z.string().datetime().optional().nullable(),
    sentToReaderDate: z.string().datetime().optional().nullable(),
    returnedToECADate: z.string().datetime().optional().nullable(),
    statusId: z.number().optional(),
    notes: z.string().optional().nullable(),
    processedByStaffId: z.number().optional().nullable(),
});

export type AssignmentUpdateInput = z.infer<typeof AssignmentUpdateInputSchema>;

// Prisma create data type
export type AssignmentCreateData = {
    readerId: number;
    catalogueId: number;
    orderId?: number | null;
    receptionDate?: Date | null;
    sentToReaderDate?: Date | null;
    returnedToECADate?: Date | null;
    statusId: number;
    notes?: string | null;
    processedByStaffId?: number | null;
};

// Prisma update data type
export type AssignmentUpdateData = {
    readerId?: number;
    catalogueId?: number;
    orderId?: number | null;
    receptionDate?: Date | null;
    sentToReaderDate?: Date | null;
    returnedToECADate?: Date | null;
    statusId?: number;
    notes?: string | null;
    processedByStaffId?: number | null;
};

// ============================================================================
// Filter/Query Types
// ============================================================================

export const AssignmentFilterSchema = z.object({
    readerId: z.number().optional(),
    catalogueId: z.number().optional(),
    orderId: z.number().optional(),
    statusId: z.number().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    hasOrder: z.boolean().optional(),
    isOverdue: z.boolean().optional(),
});

export type AssignmentFilter = z.infer<typeof AssignmentFilterSchema>;

// ============================================================================
// Helper Types
// ============================================================================

export type AssignmentWithAllRelations = Prisma.AssignmentGetPayload<{
    include: {
        reader: true;
        catalogue: true;
        order: true;
        status: true;
        processedByStaff: true;
    };
}>;