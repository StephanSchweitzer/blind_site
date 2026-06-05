// api/coups-de-coeur.api.ts
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
    basicCoupDeCoeurSelect,
    detailedCoupDeCoeurSelect,
    coupsDeCoeurIncludeConfigs,
    CoupDeCoeurWithBooks,
    CoupDeCoeur,
} from '../models/coups-de-coeur.model';

// ============================================================================
// Summary Types (for forms and UI components)
// ============================================================================

export type CoupDeCoeurSummary = Pick<CoupDeCoeur, 'id' | 'title'>;

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const CoupDeCoeurQueryModeSchema = z.enum(['basic', 'detailed', 'full']);
export type CoupDeCoeurQueryMode = z.infer<typeof CoupDeCoeurQueryModeSchema>;

export const CoupDeCoeurIncludeRelationSchema = z.enum([
    'addedBy',
    'books',
    'all',
]);
export type CoupDeCoeurIncludeRelation = z.infer<typeof CoupDeCoeurIncludeRelationSchema>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicCoupDeCoeurResponse = Prisma.CoupsDeCoeurGetPayload<{
    select: typeof basicCoupDeCoeurSelect;
}>;

export type DetailedCoupDeCoeurResponse = Prisma.CoupsDeCoeurGetPayload<{
    select: typeof detailedCoupDeCoeurSelect;
}>;

export type FullCoupDeCoeurResponse = Prisma.CoupsDeCoeurGetPayload<{
    include: typeof coupsDeCoeurIncludeConfigs;
}>;

// ============================================================================
// Search / Pagination
// ============================================================================

export interface CoupsDeCoeurResponse {
    items: CoupDeCoeurWithBooks[];
    total: number;
    page: number;
    totalPages: number;
}

// ============================================================================
// Create Input Types
// ============================================================================

export const CoupDeCoeurCreateInputSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    audioPath: z.string().min(1),
    // status: z.nativeEnum(CoupDeCoeurStatus),  <-- your new enum field, see note
    addedById: z.number().int().positive(),
    bookIds: z.array(z.number().int().positive()).optional(),
});

export type CoupDeCoeurCreateInput = z.infer<typeof CoupDeCoeurCreateInputSchema>;

export type CoupDeCoeurCreateData = {
    title: string;
    description: string;
    audioPath: string;
    addedById: number;
};

// ============================================================================
// Update Input Types
// ============================================================================

export const CoupDeCoeurUpdateInputSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    audioPath: z.string().min(1).optional(),
    bookIds: z.array(z.number().int().positive()).optional(),
});

export type CoupDeCoeurUpdateInput = z.infer<typeof CoupDeCoeurUpdateInputSchema>;

export type CoupDeCoeurUpdateData = {
    title?: string;
    description?: string;
    audioPath?: string;
};

// ============================================================================
// Filter/Query Types
// ============================================================================

export const CoupDeCoeurFilterSchema = z.object({
    title: z.string().optional(),
    addedById: z.number().optional(),
    search: z.string().optional(),
});

export type CoupDeCoeurFilter = z.infer<typeof CoupDeCoeurFilterSchema>;

// Export the include config for use in API handlers / pages
export { coupsDeCoeurIncludeConfigs };