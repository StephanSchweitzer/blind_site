import { Prisma, Assignment  } from '@prisma/client';

// ============================================================================
// Base Assignment Model Type (from Prisma)
// ============================================================================

export type { Assignment };

// ============================================================================
// Assignment with Relations
// ============================================================================



export type AssignmentWithCatalogue = Prisma.AssignmentGetPayload<{
    include: { catalogue: true };
}>;

export type AssignmentWithOrder = Prisma.AssignmentGetPayload<{
    include: { order: true };
}>;

export type AssignmentWithStatus = Prisma.AssignmentGetPayload<{
    include: { status: true };
}>;

export type AssignmentWithReaderHistory = Prisma.AssignmentGetPayload<{
    include: {
        readerHistory: {
            include: {
                reader: true;
            };
        };
    };
}>;

export type AssignmentWithAllRelations = Prisma.AssignmentGetPayload<{
    include: {
        catalogue: true;
        order: true;
        status: true;
        processedByStaff: true;
        readerHistory: {
            include: {
                reader: true;
            };
        };
    };
}>;

// ============================================================================
// Assignment Select Configurations
// ============================================================================

export const basicAssignmentSelect = {
    id: true,
    catalogueId: true,
    orderId: true,
    statusId: true,
    receptionDate: true,
    sentToReaderDate: true,
    returnedToECADate: true,
} as const satisfies Prisma.AssignmentSelect;

export const detailedAssignmentSelect = {
    id: true,
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
// Assignment Include Configurations
// ============================================================================

export const assignmentIncludeConfigs = {
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

    readerHistory: {
        orderBy: {
            assignedDate: 'desc' as const,
        },
        include: {
            reader: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    } satisfies Prisma.AssignmentReaderFindManyArgs,

    all: {
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
        readerHistory: {
            orderBy: {
                assignedDate: 'desc' as const,
            },
            include: {
                reader: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        },
    },
} as const;