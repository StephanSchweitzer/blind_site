import { Prisma } from '@prisma/client';
import { z } from 'zod';

// ============================================================================
// Query Parameter Validators
// ============================================================================

export const UserQueryModeSchema = z.enum(['basic', 'profile', 'full']);
export type UserQueryMode = z.infer<typeof UserQueryModeSchema>;

export const UserIncludeRelationSchema = z.enum([
    'addresses',
    'ordersAsAveugle',
    'ordersProcessedBy',
    'assignmentsAsReader',
    'assignmentsProcessedBy',
    'bills',
    'books',
    'coupsDeCoeur',
    'news',
    'summary'
]);
export type UserIncludeRelation = z.infer<typeof UserIncludeRelationSchema>;

// ============================================================================
// Select Configuration Types (for each mode)
// ============================================================================

export const basicUserSelect = {
    id: true,
    name: true,
    firstName: true,
    lastName: true,
    email: true,
    role: true,
} as const satisfies Prisma.UserSelect;

export const profileUserSelect = {
    id: true,
    email: true,
    name: true,
    firstName: true,
    lastName: true,
    role: true,
    createdAt: true,
    homePhone: true,
    cellPhone: true,
    gestconteNotes: true,
    gestconteId: true,
    nonProfitAffiliation: true,
    isActive: true,
    terminationDate: true,
    terminationReason: true,
    lastUpdated: true,
    preferredDeliveryMethod: true,
    paymentThreshold: true,
    currentBalance: true,
    preferredDistributionMethod: true,
    isAvailable: true,
    availabilityNotes: true,
    specialization: true,
    maxConcurrentAssignments: true,
    notes: true,
} as const satisfies Prisma.UserSelect;

// Full user select - EXPLICITLY excludes sensitive fields (password, passwordNeedsChange)
// SECURITY: Never expose password hashes in any API response
export const fullUserSelect = {
    id: true,
    email: true,
    name: true,
    firstName: true,
    lastName: true,
    role: true,
    createdAt: true,
    homePhone: true,
    cellPhone: true,
    gestconteNotes: true,
    gestconteId: true,
    nonProfitAffiliation: true,
    isActive: true,
    terminationDate: true,
    terminationReason: true,
    lastUpdated: true,
    preferredDeliveryMethod: true,
    paymentThreshold: true,
    currentBalance: true,
    preferredDistributionMethod: true,
    isAvailable: true,
    availabilityNotes: true,
    specialization: true,
    maxConcurrentAssignments: true,
    notes: true,
    // SECURITY: Explicitly exclude sensitive fields
    password: false,
    passwordNeedsChange: false,
} as const satisfies Prisma.UserSelect;

// ============================================================================
// Include Configuration Builder
// ============================================================================

export type UserIncludeConfig = {
    addresses?: boolean | Prisma.AddressDefaultArgs;
    ordersAsAveugle?: boolean | Prisma.OrdersFindManyArgs;
    ordersProcessedBy?: boolean | Prisma.OrdersFindManyArgs;
    assignmentsAsReader?: boolean | Prisma.AssignmentFindManyArgs;
    assignmentsProcessedBy?: boolean | Prisma.AssignmentFindManyArgs;
    bills?: boolean | Prisma.BillFindManyArgs;
    books?: boolean | Prisma.BookFindManyArgs;
    CoupsDeCoeur?: boolean | Prisma.CoupsDeCoeurFindManyArgs;
    News?: boolean | Prisma.NewsFindManyArgs;
    _count?: boolean | Prisma.UserCountOutputTypeDefaultArgs;
};

// Pre-configured includes for each relation type
export const userIncludeConfigs = {
    addresses: true,

    ordersAsAveugle: {
        include: {
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
        orderBy: {
            requestReceivedDate: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.OrdersFindManyArgs,

    ordersProcessedBy: {
        include: {
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
        orderBy: {
            requestReceivedDate: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.OrdersFindManyArgs,

    assignmentsAsReader: {
        include: {
            order: {
                include: {
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            id: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.AssignmentFindManyArgs,

    assignmentsProcessedBy: {
        include: {
            reader: {
                select: {
                    name: true,
                    email: true,
                },
            },
            order: {
                include: {
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            id: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.AssignmentFindManyArgs,

    bills: {
        orderBy: {
            issueDate: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.BillFindManyArgs,

    books: {
        select: {
            id: true,
            title: true,
            author: true,
            available: true,
        },
        orderBy: {
            title: 'asc' as const,
        },
    } satisfies Prisma.BookFindManyArgs,

    coupsDeCoeur: {
        include: {
            books: {
                include: {
                    book: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: 'desc' as const,
        },
    } satisfies Prisma.CoupsDeCoeurFindManyArgs,

    news: {
        orderBy: {
            publishedAt: 'desc' as const,
        },
        take: 20,
    } satisfies Prisma.NewsFindManyArgs,

    summary: {
        _count: {
            select: {
                ordersAsAveugle: true,
                ordersProcessedBy: true,
                assignmentsAsReader: true,
                assignmentsProcessedBy: true,
                bills: true,
                books: true,
            },
        },
    },
} as const;

// ============================================================================
// Response Types
// ============================================================================

// Basic mode response
export type BasicUserResponse = Prisma.UserGetPayload<{
    select: typeof basicUserSelect;
}>;

// Profile mode response
export type ProfileUserResponse = Prisma.UserGetPayload<{
    select: typeof profileUserSelect;
}>;

// Full mode response (still excludes password for security)
export type FullUserResponse = Prisma.UserGetPayload<{
    select: typeof fullUserSelect;
}>;

// Full mode response with optional includes
export type FullUserWithIncludesResponse = Prisma.UserGetPayload<{
    select: typeof fullUserSelect;
    include: UserIncludeConfig;
}>;

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
    password: z.string().optional(), // Will be rejected in handler
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

// ============================================================================
// Helper Types
// ============================================================================

export type UserWithRelationCounts = Prisma.UserGetPayload<{
    select: {
        id: true;
        name: true;
        email: true;
        isActive: true;
        _count: {
            select: {
                ordersAsAveugle: true;
                ordersProcessedBy: true;
                assignmentsAsReader: true;
                assignmentsProcessedBy: true;
            };
        };
    };
}>;