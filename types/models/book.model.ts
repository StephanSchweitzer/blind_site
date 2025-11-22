import { Prisma, Book } from '@prisma/client';

// ============================================================================
// Base Book Model Type (from Prisma)
// ============================================================================

export type { Book };

// ============================================================================
// Book with Relations
// ============================================================================

export type BookWithGenres = Prisma.BookGetPayload<{
    include: {
        genres: {
            include: {
                genre: true;
            };
        };
    };
}>;

export type BookWithAddedBy = Prisma.BookGetPayload<{
    include: {
        addedBy: true;
    };
}>;

export type BookWithOrders = Prisma.BookGetPayload<{
    include: {
        orders: true;
    };
}>;

export type BookWithAssignments = Prisma.BookGetPayload<{
    include: {
        assignments: true;
    };
}>;

export type BookWithAllRelations = Prisma.BookGetPayload<{
    include: {
        genres: {
            include: {
                genre: true;
            };
        };
        addedBy: true;
        orders: true;
        assignments: true;
        CoupsDeCoeurBooks: true;
    };
}>;

// ============================================================================
// Book Select Configurations
// ============================================================================

export const basicBookSelect = {
    id: true,
    title: true,
    author: true,
    isbn: true,
    available: true,
} as const satisfies Prisma.BookSelect;

export const detailedBookSelect = {
    id: true,
    title: true,
    subtitle: true,
    author: true,
    description: true,
    publishedDate: true,
    readingDurationMinutes: true,
    pageCount: true,
    isbn: true,
    publisher: true,
    available: true,
    createdAt: true,
    updatedAt: true,
    addedById: true,
} as const satisfies Prisma.BookSelect;

// ============================================================================
// Book Include Configurations
// ============================================================================

export const bookIncludeConfigs = {
    genres: {
        include: {
            genre: {
                select: {
                    id: true,
                    name: true,
                    description: true,
                },
            },
        },
    } satisfies Prisma.BookGenreFindManyArgs,

    addedBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    } satisfies Prisma.UserDefaultArgs,

    orders: {
        select: {
            id: true,
            requestReceivedDate: true,
            aveugle: {
                select: {
                    name: true,
                    email: true,
                },
            },
        },
        orderBy: {
            requestReceivedDate: 'desc' as const,
        },
        take: 10,
    } satisfies Prisma.OrdersFindManyArgs,

    assignments: {
        select: {
            id: true,
            statusId: true,
            receptionDate: true,
        },
        orderBy: {
            id: 'desc' as const,
        },
        take: 10,
    } satisfies Prisma.AssignmentFindManyArgs,

    all: {
        genres: {
            include: {
                genre: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                    },
                },
            },
        },
        addedBy: {
            select: {
                id: true,
                name: true,
            },
        },
    },
} as const;