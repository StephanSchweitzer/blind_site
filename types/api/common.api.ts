import { z } from 'zod';

// ============================================================================
// Genre API Types
// ============================================================================

export const GenreCreateInputSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
});

export type GenreCreateInput = z.infer<typeof GenreCreateInputSchema>;

export const GenreUpdateInputSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
});

export type GenreUpdateInput = z.infer<typeof GenreUpdateInputSchema>;

// ============================================================================
// Status API Types
// ============================================================================

export const StatusCreateInputSchema = z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
    sortOrder: z.number().int().nullable().optional(),
});

export type StatusCreateInput = z.infer<typeof StatusCreateInputSchema>;

export const StatusUpdateInputSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    sortOrder: z.number().int().nullable().optional(),
});

export type StatusUpdateInput = z.infer<typeof StatusUpdateInputSchema>;

// ============================================================================
// MediaFormat API Types
// ============================================================================

export const MediaFormatCreateInputSchema = z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(200).nullable().optional(),
});

export type MediaFormatCreateInput = z.infer<typeof MediaFormatCreateInputSchema>;

export const MediaFormatUpdateInputSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(200).nullable().optional(),
});

export type MediaFormatUpdateInput = z.infer<typeof MediaFormatUpdateInputSchema>;

// ============================================================================
// Address API Types
// ============================================================================

export const AddressCreateInputSchema = z.object({
    userId: z.number().int().positive(),
    addressLine1: z.string().nullable().optional(),
    addressSupplement: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    stateProvince: z.string().nullable().optional(),
    country: z.string().default('France'),
    isDefault: z.boolean().default(false),
});

export type AddressCreateInput = z.infer<typeof AddressCreateInputSchema>;

export const AddressUpdateInputSchema = z.object({
    addressLine1: z.string().nullable().optional(),
    addressSupplement: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    postalCode: z.string().nullable().optional(),
    stateProvince: z.string().nullable().optional(),
    country: z.string().optional(),
    isDefault: z.boolean().optional(),
});

export type AddressUpdateInput = z.infer<typeof AddressUpdateInputSchema>;

// ============================================================================
// Bill API Types
// ============================================================================

export const BillCreateInputSchema = z.object({
    clientId: z.number().int().positive(),
    stateId: z.number().int().positive(),
    creationDate: z.string().datetime(),
    issueDate: z.string().datetime().nullable().optional(),
    paymentDate: z.string().datetime().nullable().optional(),
    invoiceAmount: z.number().or(z.string()),
});

export type BillCreateInput = z.infer<typeof BillCreateInputSchema>;

export const BillUpdateInputSchema = z.object({
    stateId: z.number().int().positive().optional(),
    issueDate: z.string().datetime().nullable().optional(),
    paymentDate: z.string().datetime().nullable().optional(),
    invoiceAmount: z.number().or(z.string()).optional(),
});

export type BillUpdateInput = z.infer<typeof BillUpdateInputSchema>;

// ============================================================================
// News API Types
// ============================================================================

export const NewsCreateInputSchema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    authorId: z.number().int().positive(),
    type: z.string().default('GENERAL'),
    publishedAt: z.string().datetime().optional(),
});

export type NewsCreateInput = z.infer<typeof NewsCreateInputSchema>;

export const NewsUpdateInputSchema = z.object({
    title: z.string().min(1).optional(),
    content: z.string().min(1).optional(),
    type: z.string().optional(),
    publishedAt: z.string().datetime().optional(),
});

export type NewsUpdateInput = z.infer<typeof NewsUpdateInputSchema>;

// ============================================================================
// CoupsDeCoeur API Types
// ============================================================================

export const CoupsDeCoeurCreateInputSchema = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    audioPath: z.string().nullable().optional(),
    addedById: z.number().int().positive(),
    active: z.boolean().default(true),
    bookIds: z.array(z.number().int().positive()).optional(),
});

export type CoupsDeCoeurCreateInput = z.infer<typeof CoupsDeCoeurCreateInputSchema>;

export const CoupsDeCoeurUpdateInputSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    audioPath: z.string().nullable().optional(),
    active: z.boolean().optional(),
    bookIds: z.array(z.number().int().positive()).optional(),
});

export type CoupsDeCoeurUpdateInput = z.infer<typeof CoupsDeCoeurUpdateInputSchema>;

// Response type for CoupsDeCoeur with pagination
export interface CoupsDeCoeurResponse {
    items: Array<{
        id: number;
        title: string;
        description: string | null;
        audioPath: string | null;
        books: Array<{
            book: {
                id: number;
                title: string;
                subtitle: string | null;
                author: string;
                description: string | null;
                publishedDate: Date | null;
                readingDurationMinutes: number | null;
                pageCount: number | null;
                isbn: string | null;
                publisher: string | null;
                available: boolean;
                createdAt: Date;
                updatedAt: Date;
                addedById: number;
                genres: Array<{
                    genre: {
                        id: number;
                        name: string;
                    };
                }>;
            };
        }>;
    }>;
    total: number;
    page: number;
    totalPages: number;
}