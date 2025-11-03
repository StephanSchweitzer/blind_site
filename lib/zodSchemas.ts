import { z } from "zod";

export const assignmentUpdateSchema = z.object({
    readerId: z.number().int().positive().optional(),
    catalogueId: z.number().int().positive().optional(),
    orderId: z.number().int().positive().nullable().optional(),
    receptionDate: z.string().datetime().nullable().optional(),
    sentToReaderDate: z.string().datetime().nullable().optional(),
    returnedToECADate: z.string().datetime().nullable().optional(),
    statusId: z.number().int().positive().optional(),
    notes: z.string().nullable().optional(),
});

export type AssignmentUpdateData = z.infer<typeof assignmentUpdateSchema>;
