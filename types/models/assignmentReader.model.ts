import { Prisma, AssignmentReader } from '@prisma/client';

// ============================================================================
// Base AssignmentReader Model Type (from Prisma)
// ============================================================================

export type { AssignmentReader };

// ============================================================================
// AssignmentReader with Relations
// ============================================================================

export type AssignmentReaderWithReader = Prisma.AssignmentReaderGetPayload<{
    include: {
        reader: true;
    };
}>;

export type AssignmentReaderWithAssignment = Prisma.AssignmentReaderGetPayload<{
    include: {
        assignment: true;
    };
}>;

export type AssignmentReaderWithAllRelations = Prisma.AssignmentReaderGetPayload<{
    include: {
        reader: true;
        assignment: {
            include: {
                catalogue: true;
                order: true;
            };
        };
    };
}>;

// ============================================================================
// AssignmentReaderHistory Type (for API responses)
// This is what GET /api/assignments/[id]/readers returns
// ============================================================================

export type AssignmentReaderHistory = Prisma.AssignmentReaderGetPayload<{
    include: {
        reader: {
            select: {
                id: true;
                name: true;
                email: true;
                firstName: true;
                lastName: true;
            };
        };
    };
}>;

// ============================================================================
// AssignmentReader Include Configurations
// ============================================================================

export const assignmentReaderIncludeConfigs = {
    reader: {
        select: {
            id: true,
            name: true,
            email: true,
            firstName: true,
            lastName: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    assignment: {
        select: {
            id: true,
            catalogueId: true,
            orderId: true,
            statusId: true,
        },
    } satisfies Prisma.AssignmentDefaultArgs,

    minimal: {
        reader: {
            select: {
                id: true,
                name: true,
                email: true,
            },
        },
    },

    all: {
        reader: {
            select: {
                id: true,
                name: true,
                email: true,
                firstName: true,
                lastName: true,
            },
        },
        assignment: {
            select: {
                id: true,
                catalogueId: true,
                orderId: true,
                statusId: true,
            },
        },
    },
} as const;