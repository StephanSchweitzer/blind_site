import { Prisma, type CoupsDeCoeur as PrismaCoupDeCoeur } from '@prisma/client';

// ============================================================================
// Base Model Type
// ============================================================================

export type CoupDeCoeur = PrismaCoupDeCoeur;

// ============================================================================
// Select / Include Configs (single source of truth for queries)
// ============================================================================

export const basicCoupDeCoeurSelect = {
    id: true,
    title: true,
    audioPath: true,
} satisfies Prisma.CoupsDeCoeurSelect;

export const detailedCoupDeCoeurSelect = {
    id: true,
    title: true,
    description: true,
    audioPath: true,
    createdAt: true,
    updatedAt: true,
    addedById: true,
} satisfies Prisma.CoupsDeCoeurSelect;

// Books carry full genres so books[].book === BookWithGenres structurally
export const coupsDeCoeurIncludeConfigs = {
    addedBy: { select: { id: true, name: true } },
    books: {
        include: {
            book: { include: { genres: { include: { genre: true } } } },
        },
    },
} satisfies Prisma.CoupsDeCoeurInclude;

// ============================================================================
// Derived Model Types
// ============================================================================

export type CoupDeCoeurWithBooks = Prisma.CoupsDeCoeurGetPayload<{
    include: typeof coupsDeCoeurIncludeConfigs;
}>;