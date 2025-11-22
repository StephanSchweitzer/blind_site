import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
    basicUserSelect,
    profileUserSelect,
    fullUserSelect,
    userIncludeConfigs,
    User,
} from '../models/user.model';

// ============================================================================
// Summary Types (for forms and UI components)
// ============================================================================

export type ReaderSummary = Pick<User, 'id' | 'name' | 'email' | 'firstName' | 'lastName'>;
export type UserSummary = Pick<User, 'id' | 'name' | 'email' | 'firstName' | 'lastName'>;
export type UserMinimal = Pick<User, 'id' | 'name'>;

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const UserQueryModeSchema = z.enum(['basic', 'profile', 'full']);
export type UserQueryMode = z.infer<typeof UserQueryModeSchema>;

export const UserIncludeRelationSchema = z.enum([
    'addresses',
    'ordersAsAveugle',
    'ordersProcessedBy',
    'assignmentReaders',
    'assignmentsProcessedBy',
    'bills',
    'books',
    'coupsDeCoeur',
    'news',
    'summary',
]);
export type UserIncludeRelation = z.infer<typeof UserIncludeRelationSchema>;

// ============================================================================
// Response Types
// ============================================================================

export type BasicUserResponse = Prisma.UserGetPayload<{
    select: typeof basicUserSelect;
}>;

export type ProfileUserResponse = Prisma.UserGetPayload<{
    select: typeof profileUserSelect;
}>;

export type FullUserResponse = Prisma.UserGetPayload<{
    select: typeof fullUserSelect;
}>;

export type UserIncludeConfig = {
    addresses?: boolean | Prisma.AddressDefaultArgs;
    ordersAsAveugle?: boolean | Prisma.OrdersFindManyArgs;
    ordersProcessedBy?: boolean | Prisma.OrdersFindManyArgs;
    assignmentReaders?: boolean | Prisma.AssignmentReaderFindManyArgs;
    assignmentsProcessedBy?: boolean | Prisma.AssignmentFindManyArgs;
    bills?: boolean | Prisma.BillFindManyArgs;
    books?: boolean | Prisma.BookFindManyArgs;
    CoupsDeCoeur?: boolean | Prisma.CoupsDeCoeurFindManyArgs;
    News?: boolean | Prisma.NewsFindManyArgs;
    _count?: boolean | Prisma.UserCountOutputTypeDefaultArgs;
};

export type FullUserWithIncludesResponse = Prisma.UserGetPayload<{
    select: typeof fullUserSelect;
    include: UserIncludeConfig;
}>;

// ============================================================================
// Create Input Types
// ============================================================================

export const UserCreateInputSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.string().default('user'),
    homePhone: z.string().optional(),
    cellPhone: z.string().optional(),
    gestconteNotes: z.string().optional(),
    gestconteId: z.number().optional(),
    nonProfitAffiliation: z.string().optional(),
    preferredDeliveryMethod: z.string().optional(),
    preferredDistributionMethod: z.string().optional(),
    paymentThreshold: z.number().or(z.string()).optional().nullable(),
    currentBalance: z.number().or(z.string()).optional().nullable(),
    isAvailable: z.boolean().optional(),
    availabilityNotes: z.string().optional(),
    specialization: z.string().optional(),
    maxConcurrentAssignments: z.number().optional(),
    notes: z.string().optional(),
});

export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;

// ============================================================================
// Update Input Types
// ============================================================================

export const UserUpdateInputSchema = z.object({
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    role: z.string().optional(),
    homePhone: z.string().optional(),
    cellPhone: z.string().optional(),
    gestconteNotes: z.string().optional(),
    gestconteId: z.number().optional(),
    nonProfitAffiliation: z.string().optional(),
    isActive: z.boolean().optional(),
    terminationDate: z.string().datetime().optional().nullable(),
    terminationReason: z.string().optional(),
    preferredDeliveryMethod: z.string().optional(),
    preferredDistributionMethod: z.string().optional(),
    paymentThreshold: z.number().or(z.string()).optional().nullable(),
    currentBalance: z.number().or(z.string()).optional().nullable(),
    isAvailable: z.boolean().optional(),
    availabilityNotes: z.string().optional(),
    specialization: z.string().optional(),
    maxConcurrentAssignments: z.number().optional(),
    notes: z.string().optional(),
});

export type UserUpdateInput = z.infer<typeof UserUpdateInputSchema>;

// Prisma update data type (what actually goes to the database)
export type UserUpdateData = {
    name?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    role?: string;
    homePhone?: string | null;
    cellPhone?: string | null;
    gestconteNotes?: string | null;
    gestconteId?: number | null;
    nonProfitAffiliation?: string | null;
    isActive?: boolean | null;
    terminationDate?: Date | null;
    terminationReason?: string | null;
    preferredDeliveryMethod?: string | null;
    preferredDistributionMethod?: string | null;
    paymentThreshold?: number | null;
    currentBalance?: number | null;
    isAvailable?: boolean | null;
    availabilityNotes?: string | null;
    specialization?: string | null;
    maxConcurrentAssignments?: number | null;
    notes?: string | null;
};

// ============================================================================
// Delete Response Types
// ============================================================================

export type UserDeleteResponse = {
    message: string;
    user?: {
        id: number;
        name: string | null;
        email: string | null;
        isActive: boolean | null;
    };
    deletedId?: number;
    softDelete: boolean;
};

// Export the include configs for use in API handlers
export { userIncludeConfigs };