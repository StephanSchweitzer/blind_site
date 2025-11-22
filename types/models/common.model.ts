import {
    Prisma,
    Genre,
    Status,
    MediaFormat,
    Address,
    Bill,
    News,
    CoupsDeCoeur,
    BookGenre,
    CoupsDeCoeurBooks,
} from '@prisma/client';

// ============================================================================
// Genre Model
// ============================================================================

export type { Genre };

export type GenreWithBooks = Prisma.GenreGetPayload<{
    include: {
        books: {
            include: {
                book: true;
            };
        };
    };
}>;

// ============================================================================
// Status Model
// ============================================================================

export type { Status };

export type StatusWithRelations = Prisma.StatusGetPayload<{
    include: {
        assignments: true;
        orders: true;
        Bill: true;
    };
}>;

export type StatusSummary = Pick<Status, 'id' | 'name'>;

// ============================================================================
// MediaFormat Model
// ============================================================================

export type { MediaFormat };

export type MediaFormatWithOrders = Prisma.MediaFormatGetPayload<{
    include: {
        orders: true;
    };
}>;

// ============================================================================
// Address Model
// ============================================================================

export type { Address };

export type AddressWithUser = Prisma.AddressGetPayload<{
    include: {
        user: true;
    };
}>;

// ============================================================================
// Bill Model
// ============================================================================

export type { Bill };

export type BillWithClient = Prisma.BillGetPayload<{
    include: {
        client: true;
    };
}>;

export type BillWithState = Prisma.BillGetPayload<{
    include: {
        state: true;
    };
}>;

export type BillWithOrders = Prisma.BillGetPayload<{
    include: {
        orders: true;
    };
}>;

export type BillWithAllRelations = Prisma.BillGetPayload<{
    include: {
        client: true;
        state: true;
        orders: true;
    };
}>;

// ============================================================================
// News Model
// ============================================================================

export type { News };

export type NewsWithAuthor = Prisma.NewsGetPayload<{
    include: {
        author: true;
    };
}>;

// ============================================================================
// CoupsDeCoeur Model
// ============================================================================

export type { CoupsDeCoeur };

export type CoupsDeCoeurWithBooks = Prisma.CoupsDeCoeurGetPayload<{
    include: {
        books: {
            include: {
                book: {
                    include: {
                        genres: {
                            include: {
                                genre: true;
                            };
                        };
                    };
                };
            };
        };
    };
}>;

export type CoupsDeCoeurWithAddedBy = Prisma.CoupsDeCoeurGetPayload<{
    include: {
        addedBy: true;
    };
}>;

export type CoupsDeCoeurWithAllRelations = Prisma.CoupsDeCoeurGetPayload<{
    include: {
        books: {
            include: {
                book: {
                    include: {
                        genres: {
                            include: {
                                genre: true;
                            };
                        };
                    };
                };
            };
        };
        addedBy: true;
    };
}>;

// ============================================================================
// Join Table Models
// ============================================================================

export type  { BookGenre };

export type BookGenreWithRelations = Prisma.BookGenreGetPayload<{
    include: {
        book: true;
        genre: true;
    };
}>;

export type { CoupsDeCoeurBooks };

export type CoupsDeCoeurBooksWithRelations = Prisma.CoupsDeCoeurBooksGetPayload<{
    include: {
        book: true;
        coupsDeCoeur: true;
    };
}>;