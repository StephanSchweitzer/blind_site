import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
    basicAssignmentSelect,
    detailedAssignmentSelect,
    assignmentIncludeConfigs,
} from '../models/assignment.model';

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const AssignmentQueryModeSchema = z.enum(['basic', 'detailed', 'full']);
export type AssignmentQueryMode = z.infer<typeof AssignmentQueryModeSchema>;

export const AssignmentIncludeRelationSchema = z.enum([
    'catalogue',
    'order',
    'status',
    'processedByStaff',
    'readerHistory',
    'all',
]);
export type AssignmentIncludeRelation = z.infer<typeof AssignmentIncludeRelationSchema>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicAssignmentResponse = Prisma.AssignmentGetPayload<{
    select: typeof basicAssignmentSelect;
}>;

export type DetailedAssignmentResponse = Prisma.AssignmentGetPayload<{
    select: typeof detailedAssignmentSelect;
}>;

export type AssignmentIncludeConfig = {
    catalogue?: boolean | Prisma.BookDefaultArgs;
    order?: boolean | Prisma.OrdersDefaultArgs;
    status?: boolean | Prisma.StatusDefaultArgs;
    processedByStaff?: boolean | Prisma.UserDefaultArgs;
    readerHistory?: boolean | Prisma.AssignmentReaderFindManyArgs;
};

export type FullAssignmentResponse = Prisma.AssignmentGetPayload<{
    include: AssignmentIncludeConfig;
}>;

export type AssignmentWithAllIncludesResponse = Prisma.AssignmentGetPayload<{
    include: typeof assignmentIncludeConfigs.all;
}>;

// ============================================================================
// Create Input Types (API)
// ============================================================================

// API validation schema - includes optional readerId for initial assignment
export const AssignmentCreateInputSchema = z.object({
    catalogueId: z.number().int().positive(),
    orderId: z.number().int().positive().nullable().optional(),
    receptionDate: z.string().datetime().nullable().optional(),
    sentToReaderDate: z.string().datetime().nullable().optional(),
    returnedToECADate: z.string().datetime().nullable().optional(),
    statusId: z.number().int().positive(),
    notes: z.string().max(2000).nullable().optional(),
    processedByStaffId: z.number().int().positive().nullable().optional(),
    readerId: z.number().int().positive().nullable().optional(), // Optional initial reader
});

export type AssignmentCreateInput = z.infer<typeof AssignmentCreateInputSchema>;

export type AssignmentCreateData = {
    catalogueId: number;
    orderId?: number | null;
    statusId: number;
    receptionDate?: string | null;
    sentToReaderDate?: string | null;
    returnedToECADate?: string | null;
    notes?: string | null;
    processedByStaffId?: number | null;
    readerId?: number | null; // For initial reader assignment
};

// ============================================================================
// Update Input Types (API)
// ============================================================================

export const AssignmentUpdateInputSchema = z.object({
    catalogueId: z.number().int().positive().optional(),
    orderId: z.number().int().positive().nullable().optional(),
    receptionDate: z.string().date().nullable().optional(),
    sentToReaderDate: z.string().date().nullable().optional(),
    returnedToECADate: z.string().date().nullable().optional(),
    statusId: z.number().int().positive().optional(),
    notes: z.string().max(2000).nullable().optional(),
    processedByStaffId: z.number().int().positive().nullable().optional(),
});

export type AssignmentUpdateInput = z.infer<typeof AssignmentUpdateInputSchema>;

export type AssignmentUpdateData = {
    catalogueId?: number;
    orderId?: number | null;
    statusId?: number;
    receptionDate?: string | null;
    sentToReaderDate?: string | null;
    returnedToECADate?: string | null;
    notes?: string | null;
    processedByStaffId?: number | null;
};

// ============================================================================
// Form Types (Frontend)
// ============================================================================

export interface AssignmentFormData {
    catalogueId: number | null;
    orderId: number | null;
    receptionDate: string | null;
    sentToReaderDate: string | null;
    returnedToECADate: string | null;
    statusId: number | null;
    notes: string;
    processedByStaffId?: number | null;
}

// ============================================================================
// Filter/Query Types
// ============================================================================

export const AssignmentFilterSchema = z.object({
    catalogueId: z.number().optional(),
    orderId: z.number().optional(),
    statusId: z.number().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    hasOrder: z.boolean().optional(),
    isOverdue: z.boolean().optional(),
});

export type AssignmentFilter = z.infer<typeof AssignmentFilterSchema>;

// Export the include configs for use in API handlers
export { assignmentIncludeConfigs };
// ============================================================================
// Assignment with Current Reader Types
// ============================================================================

// Type for the current reader extracted from readerHistory
export type CurrentReaderInfo = {
    id: number;
    name: string | null;
    email: string | null;
} | null;

// Type for assignment with current reader (used in tables/forms)
export type AssignmentWithCurrentReader = {
    id: number;
    catalogueId: number;
    orderId: number | null;
    receptionDate: string | null;
    sentToReaderDate: string | null;
    returnedToECADate: string | null;
    statusId: number;
    notes: string | null;
    processedByStaffId: number | null;
    currentReader: CurrentReaderInfo;
    catalogue: {
        id: number;
        title: string;
        author: string | null;
    };
    order: {
        id: number;
    } | null;
    status: {
        id: number;
        name: string;
    };
};

// Form data that includes readerId for creating/updating reader assignments
export interface AssignmentFormDataWithReader extends AssignmentFormData {
    readerId: number | null;
}