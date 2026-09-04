import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { PaymentType, Prisma } from '@prisma/client';
import { PaymentUpdateInputSchema } from '@/types/api/payment.api';
import { withAdmin } from '@/lib/auth/guards';

const clientSelect = { id: true, name: true, firstName: true, lastName: true, email: true };
const billSelect = { id: true, invoiceAmount: true, state: true, creationDate: true };

function serialize(p: {
    amount: Prisma.Decimal;
    creationDate: Date;
    issueDate: Date | null;
    paymentDate: Date | null;
    exportDate: Date | null;
    importDate: Date | null;
    allocationDate: Date | null;
    bill: { invoiceAmount: Prisma.Decimal; creationDate: Date } | null;
    [k: string]: unknown;
}) {
    return {
        ...p,
        amount: p.amount.toString(),
        creationDate: p.creationDate.toISOString(),
        issueDate: p.issueDate?.toISOString() ?? null,
        paymentDate: p.paymentDate?.toISOString() ?? null,
        exportDate: p.exportDate?.toISOString() ?? null,
        importDate: p.importDate?.toISOString() ?? null,
        allocationDate: p.allocationDate?.toISOString() ?? null,
        bill: p.bill ? { ...p.bill, invoiceAmount: p.bill.invoiceAmount.toString(), creationDate: p.bill.creationDate.toISOString() } : null,
    };
}

export const GET = withAdmin(async (_request, context) => {
    try {
        const { id } = await context.params!;
        const paymentId = parseInt(id);
        if (isNaN(paymentId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const payment = await prisma.payment.findUnique({
            where: { id: paymentId },
            include: { client: { select: clientSelect }, bill: { select: billSelect } },
        });

        if (!payment) {
            return NextResponse.json({ error: 'Not found', message: 'Paiement introuvable' }, { status: 404 });
        }

        return NextResponse.json({ payment: serialize(payment) });
    } catch (error) {
        console.error('Error fetching payment:', error);
        return NextResponse.json(
            { error: 'Failed to fetch payment', message: 'Erreur lors de la récupération du paiement' },
            { status: 500 }
        );
    }
});

export const PATCH = withAdmin(async (request, context) => {
    revalidateAdmin();
    try {
        const { id } = await context.params!;
        const paymentId = parseInt(id);
        if (isNaN(paymentId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const body = await request.json();
        const parsed = PaymentUpdateInputSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Données invalides', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const p = parsed.data;

        const updated = await prisma.$transaction(async (tx) => {
            const existing = await tx.payment.findUnique({
                where: { id: paymentId, isActive: true },
                select: { id: true, type: true, clientId: true, billId: true },
            });
            if (!existing) throw new Error('PAYMENT_NOT_FOUND');

            const data: Record<string, unknown> = {};

            if (p.type !== undefined) data.type = p.type;
            if (p.amount !== undefined) data.amount = new Prisma.Decimal(p.amount);
            if (p.paymentMethod !== undefined) data.paymentMethod = p.paymentMethod;
            if (p.clientId !== undefined) data.clientId = p.clientId;
            if (p.creationDate !== undefined) data.creationDate = new Date(p.creationDate);
            if (p.issueDate !== undefined) data.issueDate = p.issueDate ? new Date(p.issueDate) : null;
            if (p.paymentDate !== undefined) data.paymentDate = p.paymentDate ? new Date(p.paymentDate) : null;
            if (p.allocationDate !== undefined) data.allocationDate = p.allocationDate ? new Date(p.allocationDate) : null;
            if (p.receiptNumber !== undefined) data.receiptNumber = p.receiptNumber;
            if (p.fiscalite !== undefined) data.fiscalite = p.fiscalite;
            if (p.comptable !== undefined) data.comptable = p.comptable;
            if (p.isAllocated !== undefined) data.isAllocated = p.isAllocated;
            if (p.observations !== undefined) data.observations = p.observations;

            const effectiveType = p.type ?? existing.type;
            const effectiveClientId = p.clientId !== undefined ? p.clientId : existing.clientId;

            // billId only valid for ENREGISTREMENT; otherwise always cleared.
            //
            // La facture liée est vérifiée contre le client EFFECTIF — y compris
            // quand la requête ne parle pas de billId.
            //
            // Le contrôle ne vivait que dans la branche `p.billId !== undefined` :
            // une requête qui changeait `clientId` sans rien dire du billId le
            // sautait entièrement et laissait le billId stocké en place. Le paiement
            // d'un auditeur se retrouvait donc enregistré sur la facture d'un autre —
            // exactement ce que guardOrderClientOnBill empêche du côté des demandes,
            // où le commentaire dit « la facture facturait une personne pour le livre
            // d'une autre ».
            // Revérifié quand le billId est fourni, ou quand le client bouge — pas
            // sur une modification sans rapport (une observation, une date). Un
            // paiement ancien dont la facture a depuis été supprimée reste ainsi
            // modifiable, au lieu d'être pris en otage par son historique : c'est la
            // même échappatoire étroite que guardClosureDateRequiresTermine.
            const clientIsChanging = p.clientId !== undefined && p.clientId !== existing.clientId;
            const resultingBillId = p.billId !== undefined ? p.billId : existing.billId;
            const mustRevalidateBill = p.billId !== undefined || clientIsChanging;

            if (effectiveType !== PaymentType.ENREGISTREMENT) {
                data.billId = null;
            } else if (!mustRevalidateBill) {
                // Rien à faire : data.billId reste absent, la colonne ne bouge pas.
            } else if (resultingBillId === null) {
                data.billId = null;
            } else {
                const bill = await tx.bill.findUnique({
                    where: { id: resultingBillId, isActive: true },
                    select: { id: true, clientId: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (effectiveClientId != null && bill.clientId !== effectiveClientId) {
                    throw new Error('BILL_CLIENT_MISMATCH');
                }
                data.billId = resultingBillId;
            }

            // cotisationYear only valid for COTISATION; otherwise always cleared.
            if (effectiveType !== PaymentType.COTISATION) {
                data.cotisationYear = null;
            } else if (p.cotisationYear !== undefined) {
                data.cotisationYear = p.cotisationYear;
            }

            return tx.payment.update({
                where: { id: paymentId },
                data,
                include: { client: { select: clientSelect }, bill: { select: billSelect } },
            });
        });

        return NextResponse.json({ payment: serialize(updated), message: 'Paiement mis à jour avec succès' });
    } catch (error) {
        console.error('Error patching payment:', error);

        const msg = error instanceof Error ? error.message : '';
        const errorMap: Record<string, [string, number]> = {
            PAYMENT_NOT_FOUND: ['Paiement introuvable', 404],
            BILL_NOT_FOUND: ['La facture liée est introuvable ou inactive', 409],
            BILL_CLIENT_MISMATCH: ['La facture liée n’appartient pas au client du paiement', 400],
        };
        if (errorMap[msg]) {
            return NextResponse.json({ error: msg, message: errorMap[msg][0] }, { status: errorMap[msg][1] });
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
            return NextResponse.json(
                { error: 'Foreign key constraint failed', message: 'Le client ou la facture est invalide.' },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to update payment', message: 'Une erreur inattendue est survenue' },
            { status: 500 }
        );
    }
});

// Soft delete: mark inactive, stamp deletedAt, store an optional reason.
export const DELETE = withAdmin(async (request, context) => {
    revalidateAdmin();
    try {
        const { id } = await context.params!;
        const paymentId = parseInt(id);
        if (isNaN(paymentId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

        const existing = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true } });
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Paiement introuvable' }, { status: 404 });
        }

        await prisma.payment.update({
            where: { id: paymentId },
            data: { isActive: false, deletedAt: new Date(), deletionReason: reason },
        });

        return NextResponse.json({ message: 'Paiement supprimé avec succès' });
    } catch (error) {
        console.error('Error deleting payment:', error);
        return NextResponse.json(
            { error: 'Failed to delete payment', message: 'Une erreur inattendue est survenue', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
});