import { Prisma, User } from '@prisma/client';

// ============================================================================
// Base User Model Type (from Prisma)
// ============================================================================

export type { User };

// ============================================================================
// User with Relations
// ============================================================================

export type UserWithAddresses = Prisma.UserGetPayload<{
    include: { addresses: true };
}>;

export type UserWithOrdersAsAveugle = Prisma.UserGetPayload<{
    include: {
        ordersAsAveugle: {
            include: {
                catalogue: true;
                status: true;
            };
        };
    };
}>;

export type UserWithAssignmentReaders = Prisma.UserGetPayload<{
    include: {
        assignmentReaders: {
            include: {
                assignment: {
                    include: {
                        catalogue: true;
                        order: true;
                    };
                };
            };
        };
    };
}>;

export type UserWithAllRelations = Prisma.UserGetPayload<{
    include: {
        addresses: true;
        ordersAsAveugle: true;
        ordersProcessedBy: true;
        assignmentReaders: true;
        assignmentsProcessedBy: true;
        bills: true;
        books: true;
        CoupsDeCoeur: true;
        News: true;
    };
}>;

// ============================================================================
// User Select Configurations
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

// SECURITY: Full user select explicitly excludes password fields
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
// User Include Configurations
// ============================================================================

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

    assignmentReaders: {
        include: {
            assignment: {
                include: {
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                            requestReceivedDate: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            assignedDate: 'desc' as const,
        },
        take: 50,
    } satisfies Prisma.AssignmentReaderFindManyArgs,

    assignmentsProcessedBy: {
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
            catalogue: {
                select: {
                    title: true,
                    author: true,
                },
            },
            order: {
                select: {
                    id: true,
                    requestReceivedDate: true,
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
                assignmentReaders: true,
                assignmentsProcessedBy: true,
                bills: true,
                books: true,
            },
        },
    },
} as const;

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
                assignmentReaders: true;
                assignmentsProcessedBy: true;
            };
        };
    };
}>;