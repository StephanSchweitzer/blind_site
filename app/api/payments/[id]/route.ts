import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { PaymentType, Prisma, BillingStatus } from '@prisma/client';
import { isClientRequiredForPaymentType } from '@/lib/payment-enums';
import { PaymentUpdateInputSchema } from '@/types/api/payment.api';
import { withAdmin } from '@/lib/auth/guards';
import {
    syncBillPaymentInfo,
    paymentPrecedesIssue,
    archiveHandTypedSettlement,
    BILL_IS_DRAFT_MESSAGE,
} from '@/lib/billing';

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

export const PATCH = withAdmin(async (request, { me, params }) => {
    revalidateAdmin();
    try {
        const { id } = await params!;
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
                select: { id: true, type: true, clientId: true, billId: true, paymentDate: true },
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
            if (p.paymentReference !== undefined) data.paymentReference = p.paymentReference;
            if (p.receiptNumber !== undefined) data.receiptNumber = p.receiptNumber;
            if (p.fiscalite !== undefined) data.fiscalite = p.fiscalite;
            if (p.comptable !== undefined) data.comptable = p.comptable;
            if (p.isAllocated !== undefined) data.isAllocated = p.isAllocated;
            if (p.observations !== undefined) data.observations = p.observations;

            const effectiveType = p.type ?? existing.type;
            const effectiveClientId = p.clientId !== undefined ? p.clientId : existing.clientId;

            // Le contrôle porte sur le RÉSULTAT, pas sur ce que la requête dit.
            //
            // Changer le type d'un « Divers » anonyme en « Don » ne parle pas du
            // client et laisserait donc passer un don sans donateur ; c'est le
            // couple (type, client) tel qu'il sera enregistré qui doit tenir.
            // Conséquence assumée : un paiement importé sans client ne se modifie
            // plus sans qu'on lui en attribue un — c'est précisément la reprise
            // que ce contrôle sert à faire.
            if (effectiveClientId == null && isClientRequiredForPaymentType(effectiveType)) {
                throw new Error('CLIENT_REQUIRED');
            }

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
            // Revérifié quand la facture CHANGE, ou quand le client bouge — pas sur
            // une modification sans rapport (une observation, une date). Un
            // paiement ancien dont la facture a depuis été supprimée reste ainsi
            // modifiable, au lieu d'être pris en otage par son historique : c'est la
            // même échappatoire étroite que guardClosureDateRequiresTermine.
            //
            // « Change », et non « est fourni » : le formulaire renvoie TOUS les
            // champs à chaque enregistrement, billId compris. Tester sa seule
            // présence refermait l'échappatoire sur le seul client de la route —
            // le paiement d'une facture supprimée n'était plus modifiable du tout.
            const clientIsChanging = p.clientId !== undefined && p.clientId !== existing.clientId;
            const resultingBillId = p.billId !== undefined ? p.billId : existing.billId;
            const billIsChanging = resultingBillId !== existing.billId;
            const mustRevalidateBill = billIsChanging || clientIsChanging;

            if (effectiveType !== PaymentType.ENREGISTREMENT) {
                data.billId = null;
            } else if (!mustRevalidateBill) {
                // Rien à faire : data.billId reste absent, la colonne ne bouge pas.
            } else if (resultingBillId === null) {
                data.billId = null;
            } else {
                const bill = await tx.bill.findUnique({
                    where: { id: resultingBillId, isActive: true },
                    select: { id: true, clientId: true, issueDate: true, state: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (effectiveClientId != null && bill.clientId !== effectiveClientId) {
                    throw new Error('BILL_CLIENT_MISMATCH');
                }
                if (billIsChanging) {
                    // Même refus qu'à la création (POST /api/payments). Seulement
                    // sur un NOUVEAU rattachement : un paiement déjà posé sur un
                    // brouillon, d'avant ce refus, doit rester modifiable.
                    if (bill.state === BillingStatus.DRAFT) throw new Error('BILL_IS_DRAFT');
                    // Avant l'update : syncBillPaymentInfo va réécrire la référence
                    // et la date de la facture d'après ce paiement.
                    await archiveHandTypedSettlement(tx, resultingBillId, me.id);
                }
                data.billId = resultingBillId;
            }

            // Réglée avant d'être émise : le contrôle que la facture posait sur sa
            // propre colonne, là où la date se saisit maintenant. Testé sur la date
            // EFFECTIVE, pour qu'une modification qui ne touche qu'elle soit vue —
            // mais seulement quand la date ou la facture CHANGE. Le formulaire
            // renvoie la date à chaque enregistrement : la tester à chaque fois
            // interdisait de corriger une observation sur un paiement déjà
            // antérieur à l'émission, le cas même que ce contrôle signale.
            const effectivePaymentDate =
                p.paymentDate !== undefined
                    ? (p.paymentDate ? new Date(p.paymentDate) : null)
                    : existing.paymentDate;
            const dateIsChanging =
                (effectivePaymentDate?.getTime() ?? null) !== (existing.paymentDate?.getTime() ?? null);
            const billIdForDateCheck =
                effectiveType === PaymentType.ENREGISTREMENT ? resultingBillId : null;
            if (effectivePaymentDate && billIdForDateCheck != null && (dateIsChanging || billIsChanging)) {
                const target = await tx.bill.findUnique({
                    where: { id: billIdForDateCheck },
                    select: { issueDate: true },
                });
                if (target && paymentPrecedesIssue(effectivePaymentDate, target.issueDate)) {
                    throw new Error('PAYMENT_BEFORE_ISSUE');
                }
            }

            // cotisationYear only valid for COTISATION; otherwise always cleared.
            if (effectiveType !== PaymentType.COTISATION) {
                data.cotisationYear = null;
            } else if (p.cotisationYear !== undefined) {
                data.cotisationYear = p.cotisationYear;
            }

            const saved = await tx.payment.update({
                where: { id: paymentId },
                data,
                include: { client: { select: clientSelect }, bill: { select: billSelect } },
            });

            // Les DEUX factures, quand le paiement change de facture : celle qu'il
            // quitte perd sa référence autant que celle qu'il rejoint la gagne. Ne
            // resynchroniser que la nouvelle laisserait l'ancienne annoncer un
            // règlement qui n'est plus le sien.
            const touched = new Set<number>();
            if (existing.billId != null) touched.add(existing.billId);
            const savedBillId = saved.billId;
            if (savedBillId != null) touched.add(savedBillId);
            for (const id of touched) await syncBillPaymentInfo(tx, id);

            return saved;
        });

        return NextResponse.json({ payment: serialize(updated), message: 'Paiement mis à jour avec succès' });
    } catch (error) {
        console.error('Error patching payment:', error);

        const msg = error instanceof Error ? error.message : '';
        const errorMap: Record<string, [string, number]> = {
            PAYMENT_NOT_FOUND: ['Paiement introuvable', 404],
            CLIENT_REQUIRED: ['Ce type de paiement doit être rattaché à une personne', 400],
            PAYMENT_BEFORE_ISSUE: ['La date de paiement ne peut pas précéder la date d’émission de la facture', 400],
            BILL_SETTLED_NEEDS_PAYMENT: [
                'La facture que ce paiement réglait est payée ou soldée : elle doit garder au moins un paiement. Rouvrez la facture avant de détacher son règlement.',
                409,
            ],
            BILL_NOT_FOUND: ['La facture liée est introuvable ou inactive', 409],
            BILL_IS_DRAFT: [BILL_IS_DRAFT_MESSAGE, 409],
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

        const existing = await prisma.payment.findUnique({
            where: { id: paymentId },
            select: { id: true, isActive: true, billId: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Paiement introuvable' }, { status: 404 });
        }
        // Une seconde suppression réécrivait `deletedAt` et `deletionReason` :
        // la date et le motif d'origine — les deux seules choses qui disent
        // POURQUOI le paiement est parti — étaient remplacés par ceux du
        // deuxième clic, souvent vides.
        if (!existing.isActive) {
            return NextResponse.json(
                { error: 'Already deleted', message: 'Ce paiement est déjà supprimé.' },
                { status: 409 }
            );
        }

        // La suppression et la resynchronisation dans la même transaction : la
        // facture ne doit jamais exister, même un instant, en annonçant un
        // règlement dont le paiement vient de partir. Et si elle est payée, c'est
        // syncBillPaymentInfo qui refuse — la facture se rouvre d'abord.
        await prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { id: paymentId },
                data: { isActive: false, deletedAt: new Date(), deletionReason: reason },
            });
            if (existing.billId != null) await syncBillPaymentInfo(tx, existing.billId);
        });

        return NextResponse.json({ message: 'Paiement supprimé avec succès' });
    } catch (error) {
        console.error('Error deleting payment:', error);
        if (error instanceof Error && error.message === 'BILL_SETTLED_NEEDS_PAYMENT') {
            return NextResponse.json(
                {
                    error: error.message,
                    message:
                        'La facture que ce paiement réglait est payée ou soldée : elle doit garder au moins un paiement. Rouvrez la facture avant de supprimer son règlement.',
                },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: 'Failed to delete payment', message: 'Une erreur inattendue est survenue', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
});