import { z } from 'zod';
import { assignmentReaderIncludeConfigs } from '../models/assignmentReader.model';

// ============================================================================
// Create Input Types
// ============================================================================

// Full create schema (includes assignmentId in body)
export const AssignmentReaderCreateInputSchema = z.object({
    assignmentId: z.number().int().positive(),
    readerId: z.number().int().positive(),
    assignedDate: z.string().datetime().optional(),
    notes: z.string().max(1000).nullable().optional(),
});

export type AssignmentReaderCreateInput = z.infer<typeof AssignmentReaderCreateInputSchema>;

// Create schema for endpoint where assignmentId comes from URL
// Used by: POST /api/assignments/[id]/readers
export const AssignmentReaderAssignSchema = z.object({
    readerId: z.number().int().positive(),
    notes: z.string().max(500).nullable().optional(),
});

export type AssignmentReaderAssignInput = z.infer<typeof AssignmentReaderAssignSchema>;

export type AssignmentReaderCreateData = {
    assignmentId: number;
    readerId: number;
    assignedDate?: Date;
    notes?: string | null;
};

// ============================================================================
// Update Input Types
// ============================================================================

export const AssignmentReaderUpdateInputSchema = z.object({
    readerId: z.number().int().positive().optional(),
    assignedDate: z.string().datetime().optional(),
    notes: z.string().max(1000).nullable().optional(),
});

export type AssignmentReaderUpdateInput = z.infer<typeof AssignmentReaderUpdateInputSchema>;

export type AssignmentReaderUpdateData = {
    readerId?: number;
    assignedDate?: Date;
    notes?: string | null;
};

// Export the include configs for use in API handlers
export { assignmentReaderIncludeConfigs };