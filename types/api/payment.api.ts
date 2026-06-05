import { z } from 'zod';
import { PaymentType, PaymentMethod } from '@prisma/client';

// Accepts an ISO datetime string produced by Date.toISOString().
const isoDate = z.string().datetime();
const nullableIsoDate = isoDate.nullable().optional();

// Trims strings, turns "" into null, leaves `undefined` untouched (so PATCH can
// distinguish "clear this field" from "don't touch this field").
const optionalText = z.preprocess(
    (v) => {
        if (typeof v !== 'string') return v;
        const t = v.trim();
        return t === '' ? null : t;
    },
    z.string().min(1).nullable().optional()
);

const amount = z.coerce
    .number()
    .refine((n) => Number.isFinite(n) && n > 0, 'Le montant doit être un nombre positif');

const cotisationYear = z.coerce.number().int().min(1900).max(2200).nullable().optional();

// ─── Create ───────────────────────────────────────────────────────────────────

export const PaymentCreateInputSchema = z
    .object({
        clientId: z.number().int().positive().nullable().optional(),
        type: z.nativeEnum(PaymentType),
        amount,
        paymentMethod: z.nativeEnum(PaymentMethod).nullable().optional(),
        creationDate: isoDate.optional(),
        issueDate: nullableIsoDate,
        paymentDate: nullableIsoDate,
        allocationDate: nullableIsoDate,
        receiptNumber: optionalText,
        fiscalite: optionalText,
        cotisationYear,
        comptable: optionalText,
        isAllocated: z.boolean().nullable().optional(),
        observations: optionalText,
        billId: z.number().int().positive().nullable().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.billId != null && data.type !== PaymentType.ENREGISTREMENT) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['billId'],
                message: 'Une facture ne peut être liée qu’à un paiement de type Enregistrement',
            });
        }
        if (data.cotisationYear != null && data.type !== PaymentType.COTISATION) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cotisationYear'],
                message: 'L’année de cotisation ne s’applique qu’aux cotisations',
            });
        }
    });

// ─── Update (partial) ───────────────────────────────────────────────────────────

export const PaymentUpdateInputSchema = z.object({
    clientId: z.number().int().positive().nullable().optional(),
    type: z.nativeEnum(PaymentType).optional(),
    amount: amount.optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).nullable().optional(),
    creationDate: isoDate.optional(),
    issueDate: nullableIsoDate,
    paymentDate: nullableIsoDate,
    allocationDate: nullableIsoDate,
    receiptNumber: optionalText,
    fiscalite: optionalText,
    cotisationYear,
    comptable: optionalText,
    isAllocated: z.boolean().nullable().optional(),
    observations: optionalText,
    billId: z.number().int().positive().nullable().optional(),
});

export type PaymentCreateInput = z.infer<typeof PaymentCreateInputSchema>;
export type PaymentUpdateInput = z.infer<typeof PaymentUpdateInputSchema>;

// ─── Serialized shape returned by the API (Decimal/Date → string) ──────────────

export interface SerializedPayment {
    id: number;
    clientId: number | null;
    type: PaymentType;
    amount: string;
    paymentMethod: PaymentMethod | null;
    creationDate: string;
    issueDate: string | null;
    paymentDate: string | null;
    exportDate: string | null;
    importDate: string | null;
    receiptNumber: string | null;
    fiscalite: string | null;
    cotisationYear: number | null;
    comptable: string | null;
    isAllocated: boolean | null;
    allocationDate: string | null;
    observations: string | null;
    billId: number | null;
    isActive: boolean;
    client: { id: number; name: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
    bill: { id: number; invoiceAmount: string; state: string } | null;
}