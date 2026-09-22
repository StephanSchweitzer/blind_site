import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdmin } from '@/lib/auth/guards';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { getBillingStatusLabel } from '@/lib/billing-enums';
import { BillingStatus } from '@prisma/client';
import { recomputeBillTotal, detachOrderFromBill } from '@/lib/billing';

async function orderIdFrom(params?: Promise<Record<string, string>>): Promise<number | null> {
    const { id } = (await params) ?? {};
    const orderId = Number(id);
    return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

/**
 * Le pendant de DELETE /api/orders/[id] — même principe que POST
 * /api/books/[id]/restore et POST /api/user/[id]/restore : la demande n'a
 * jamais été détruite, `deletedAt` la cachait seulement (findUnique n'est pas
 * filtré par lib/prisma.ts), donc l'undo est une écriture, pas une
 * reconstruction depuis le journal.
 *
 * SEULE COMPLICATION : LA FACTURE A PU ÉVOLUER PENDANT LA SUPPRESSION
 *
 * recomputeBillTotal et le suivi de statut (ordersFollowingBillState, dans
 * lib/billing.ts) ne comptent que les demandes isActive : une demande
 * supprimée qui portait un billId reste accrochée à une facture qui, elle, a
 * continué sa vie — brouillon devenu émise, payée, soldée — sans jamais la
 * revoir. La restaurer telle quelle rattacherait une demande « vivante » à une
 * facture verrouillée (.claude/rules/billing-pricing.md : PAID/SOLDE ne se
 * modifient plus).
 *
 * Donc : facture toujours DRAFT → restauration normale, total recalculé.
 * Facture partie plus loin → restauration quand même, mais détachée
 * (detachOrderFromBill), exactly comme une demande qui sort de « Terminé »
 * pendant que sa facture est déjà émise (guardOrderLeavingTermineOnBill).
 * Jamais de blocage : contrairement à l'ISBN d'un livre, rien ici n'est une
 * contrainte d'unicité — juste une facture qu'on ne rouvre pas pour si peu.
 */

function billDetachWarning(billId: number, billState: BillingStatus): string {
    return (
        `La facture #${billId} (${getBillingStatusLabel(billState).toLowerCase()}) a évolué depuis ` +
        `la suppression de cette demande : la restaurer la détachera de cette facture. ` +
        `Vous pourrez la refacturer séparément si besoin.`
    );
}

export const GET = withAdmin(async (_request, { params }) => {
    const orderId = await orderIdFrom(params);
    if (orderId === null) {
        return NextResponse.json({ message: 'ID de demande invalide' }, { status: 400 });
    }

    const order = await prisma.orders.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            deletedAt: true,
            billId: true,
            bill: { select: { id: true, state: true } },
        },
    });
    if (!order) {
        return NextResponse.json({ message: 'Demande non trouvée' }, { status: 404 });
    }

    const willDetach = !!order.billId && order.bill != null && order.bill.state !== BillingStatus.DRAFT;
    return NextResponse.json({
        deletedAt: order.deletedAt,
        billId: order.billId,
        billState: order.bill?.state ?? null,
        willDetach,
        restoreWarning: willDetach ? billDetachWarning(order.bill!.id, order.bill!.state) : null,
    });
});

export const POST = withAdmin(async (_request, { params, me }) => {
    const orderId = await orderIdFrom(params);
    if (orderId === null) {
        return NextResponse.json({ message: 'ID de demande invalide' }, { status: 400 });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findUnique({
                where: { id: orderId },
                select: {
                    id: true,
                    deletedAt: true,
                    billId: true,
                    bill: { select: { id: true, state: true } },
                },
            });
            if (!order) return { kind: 'not-found' as const };
            if (!order.deletedAt) return { kind: 'already-active' as const };

            await tx.orders.update({
                where: { id: orderId },
                data: { isActive: true, deletedAt: null },
            });

            const billLocked = order.billId != null && order.bill != null && order.bill.state !== BillingStatus.DRAFT;
            if (order.billId != null && billLocked) {
                await detachOrderFromBill(tx, {
                    orderId,
                    billId: order.billId,
                    reason: 'Demande restaurée alors que sa facture avait déjà évolué',
                    performedById: me.id,
                });
                return { kind: 'restored-detached' as const, billId: order.bill!.id, billState: order.bill!.state };
            }

            if (order.billId != null) {
                await recomputeBillTotal(tx, order.billId);
            }
            return { kind: 'restored' as const };
        });

        if (result.kind === 'not-found') {
            return NextResponse.json({ message: 'Demande non trouvée' }, { status: 404 });
        }
        if (result.kind === 'already-active') {
            return NextResponse.json({
                message: 'Cette demande n’est pas supprimée : rien à restaurer.',
                restoredId: orderId,
                alreadyActive: true,
            });
        }

        revalidateAdmin();

        if (result.kind === 'restored-detached') {
            return NextResponse.json({
                message: `La demande a été restaurée. ${billDetachWarning(result.billId, result.billState)}`,
                restoredId: orderId,
                detachedFromBillId: result.billId,
            });
        }

        return NextResponse.json({
            message: 'La demande a été restaurée. Elle réapparaît dans les listes et les recherches.',
            restoredId: orderId,
        });
    } catch (error) {
        console.error('Error restoring order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la restauration de la demande' },
            { status: 500 }
        );
    }
});
