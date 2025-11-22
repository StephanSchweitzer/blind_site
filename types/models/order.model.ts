import { Prisma, Orders } from '@prisma/client';

// ============================================================================
// Base Order Model Type (from Prisma)
// ============================================================================

export type { Orders };

// ============================================================================
// Order with Relations
// ============================================================================

export type OrderWithAveugle = Prisma.OrdersGetPayload<{
    include: { aveugle: true };
}>;

export type OrderWithCatalogue = Prisma.OrdersGetPayload<{
    include: { catalogue: true };
}>;

export type OrderWithStatus = Prisma.OrdersGetPayload<{
    include: { status: true };
}>;

export type OrderWithAssignments = Prisma.OrdersGetPayload<{
    include: {
        assignments: {
            include: {
                readerHistory: true;
                status: true;
            };
        };
    };
}>;

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

// ============================================================================
// Order Select Configurations
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
// Order Include Configurations
// ============================================================================

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
            readerHistory: {
                orderBy: {
                    assignedDate: 'desc' as const,
                },
                take: 1,
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
            status: {
                select: {
                    id: true,
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
                readerHistory: {
                    orderBy: {
                        assignedDate: 'desc' as const,
                    },
                    take: 1,
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
                status: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        },
    },
} as const;