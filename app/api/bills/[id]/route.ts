import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { Prisma, BillingStatus, OrderBillingStatus } from '@prisma/client';
import { userAddressLines } from '@/lib/users/formatAddress';
import { getBillingStatusLabel } from '@/lib/billing-enums';
import { STATUS } from '@/lib/statusSync';
import {
    recomputeBillTotal,
    logBillEvent,
    transitionEventType,
    orderBillingForBillState,
    ordersFollowingBillState,
    detachedBillingStatus,
    paymentPrecedesIssue,
} from '@/lib/billing';
import { withAdmin } from '@/lib/auth/guards';

export const GET = withAdmin(async (_request, context) => {
    try {
        const { id } = await context.params!;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const bill = await prisma.bill.findUnique({
            where: { id: billId },
            include: {
                client: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        civility: { select: { name: true } },
                        // #12 — postal address for the factures modal + PDF.
                        addresses: {
                            select: {
                                addressLine1: true,
                                addressSupplement: true,
                                city: true,
                                postalCode: true,
                                stateProvince: true,
                                country: true,
                                isDefault: true,
                            },
                        },
                    },
                },
                orders: {
                    // Un include de relation échappe au filtre soft-delete global
                    // (lib/prisma.ts), et recomputeBillTotal ne somme que les
                    // demandes actives : sans ce where, une demande supprimée
                    // s'imprimait sur la facture sans être dans le total.
                    where: { isActive: true },
                    select: {
                        id: true,
                        requestReceivedDate: true,
                        // Imprimés sur la facture (BillPDF) : la date de clôture est
                        // celle de la prestation — le jour où l'enregistrement est
                        // parti chez l'auditeur — et isDuplication distingue une
                        // duplication d'un enregistrement dans la colonne « Type ».
                        closureDate: true,
                        isDuplication: true,
                        cost: true,
                        billingStatus: true,
                        catalogue: { select: { title: true, author: true } },
                    },
                    // Trié sur la date imprimée, sinon la colonne « Livraison » de la
                    // facture saute d'une ligne à l'autre. Les rares demandes sans date
                    // de clôture (legacy) ferment la liste plutôt que de l'ouvrir.
                    orderBy: [{ closureDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
                },
                events: {
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        type: true,
                        fromState: true,
                        toState: true,
                        payload: true,
                        createdAt: true,
                        performedBy: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!bill) {
            return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
        }

        // #12 — flatten the client into the shape the PDF/modal consume:
        // civility as a plain string and the default address as display lines.
        const { addresses, civility, ...clientRest } = bill.client;
        const shapedBill = {
            ...bill,
            client: {
                ...clientRest,
                civility: civility?.name ?? null,
                address: userAddressLines(addresses),
            },
        };

        return NextResponse.json({ bill: shapedBill });
    } catch (error) {
        console.error('Error fetching bill:', error);
        return NextResponse.json(
            { error: 'Failed to fetch bill', message: 'Erreur lors de la récupération de la facture' },
            { status: 500 }
        );
    }
});

export const PATCH = withAdmin(async (request, { me, params }) => {
    revalidateAdmin();
    try {
        const performedById = me.id;

        const { id } = await params!;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const body = await request.json();
        const { action } = body;

        if (action === 'updateStatus') {
            const { state, paymentReference, paymentDate } = body;

            const validStates = ['DRAFT', 'BILLED', 'PAID', 'SOLDE'];
            if (!validStates.includes(state)) {
                return NextResponse.json({ error: 'Invalid state', message: 'Statut invalide' }, { status: 400 });
            }

            if (state === 'PAID' && !paymentReference?.trim()) {
                return NextResponse.json(
                    { error: 'Payment reference required', message: 'Un identifiant de paiement est requis pour marquer une facture comme payée' },
                    { status: 400 }
                );
            }

            const bill = await prisma.bill.findUnique({
                where: { id: billId, isActive: true },
                select: { id: true, state: true, issueDate: true },
            });
            if (!bill) {
                return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
            }

            const transitions: Record<string, string[]> = {
                DRAFT: ['BILLED'],
                BILLED: ['DRAFT', 'PAID'],
                PAID: ['SOLDE'],
                SOLDE: [],
            };
            if (!transitions[bill.state]?.includes(state)) {
                return NextResponse.json(
                    { error: 'Invalid transition', message: `Transition de ${bill.state} vers ${state} non autorisée` },
                    { status: 400 }
                );
            }

            const updateData: Record<string, unknown> = { state };
            if (state === 'BILLED') updateData.issueDate = new Date();
            if (state === 'DRAFT') updateData.issueDate = null;
            if (state === 'PAID') {
                // La date de paiement est SAISIE, pas déduite du moment du clic.
                //
                // Encaisser une facture émise il y a trois semaines est le cas
                // courant, et « aujourd'hui » écrivait alors une date fausse dans
                // la seule colonne qui dit quand l'auditeur a réglé. Absente, elle
                // retombe sur le jour même — l'ancien comportement, pour tout
                // appelant qui ne la fournit pas.
                let resolvedPaymentDate = new Date();
                if (paymentDate) {
                    resolvedPaymentDate = new Date(paymentDate);
                    if (isNaN(resolvedPaymentDate.getTime())) {
                        return NextResponse.json(
                            { error: 'Invalid paymentDate', message: 'La date de paiement est invalide' },
                            { status: 400 }
                        );
                    }
                }
                if (paymentPrecedesIssue(resolvedPaymentDate, bill.issueDate)) {
                    return NextResponse.json(
                        {
                            error: 'Payment before issue',
                            message: 'La date de paiement ne peut pas précéder la date d\'émission',
                        },
                        { status: 400 }
                    );
                }
                updateData.paymentDate = resolvedPaymentDate;
                updateData.paymentReference = paymentReference.trim();
            }

            await prisma.$transaction(async (tx) => {
                await tx.bill.update({ where: { id: billId }, data: updateData });
                // Keep attached orders' billingStatus in sync with the bill's state —
                // except the two categories that don't follow it (see
                // ordersFollowingBillState): « Non facturable » is out of the cycle by
                // decision, and a soft-deleted demande is counted nowhere.
                await tx.orders.updateMany({
                    where: ordersFollowingBillState(billId),
                    data: { billingStatus: orderBillingForBillState(state) },
                });
                const evType = transitionEventType(bill.state, state);
                if (evType) {
                    await logBillEvent(tx, {
                        billId,
                        type: evType,
                        fromState: bill.state as BillingStatus,
                        toState: state as BillingStatus,
                        payload: state === 'PAID' ? { paymentReference: paymentReference.trim() } : null,
                        performedById,
                    });
                }
            });
            return NextResponse.json({ message: 'Statut mis à jour avec succès' });
        }

        // Reopen a finalized bill (PAID or SOLDE) back to BILLED so it can be corrected.
        // Payment fields are cleared but archived in the audit log so they aren't lost.
        if (action === 'reopenBill') {
            const bill = await prisma.bill.findUnique({
                where: { id: billId, isActive: true },
                select: { id: true, state: true, paymentReference: true, paymentDate: true },
            });
            if (!bill) {
                return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
            }
            if (bill.state !== BillingStatus.PAID && bill.state !== BillingStatus.SOLDE) {
                return NextResponse.json(
                    { error: 'Invalid state', message: 'Seules les factures payées ou soldées peuvent être rouvertes.' },
                    { status: 400 }
                );
            }

            await prisma.$transaction(async (tx) => {
                await tx.bill.update({
                    where: { id: billId },
                    data: { state: BillingStatus.BILLED, paymentReference: null, paymentDate: null },
                });
                // The bill is still issued (émise), so its orders remain BILLED.
                await tx.orders.updateMany({
                    where: ordersFollowingBillState(billId),
                    data: { billingStatus: 'BILLED' },
                });
                await logBillEvent(tx, {
                    billId,
                    type: 'REOPENED',
                    fromState: bill.state,
                    toState: BillingStatus.BILLED,
                    payload: {
                        clearedPaymentReference: bill.paymentReference,
                        clearedPaymentDate: bill.paymentDate ? bill.paymentDate.toISOString() : null,
                    },
                    performedById,
                });
            });

            return NextResponse.json({
                message: `Facture rouverte (état précédent : ${bill.state === BillingStatus.PAID ? 'payée' : 'soldée'}). Les informations de paiement ont été archivées dans l'historique.`,
            });
        }

        if (action === 'addOrder') {
            const { orderId } = body;
            if (!orderId || isNaN(parseInt(orderId))) {
                return NextResponse.json({ error: 'Invalid orderId', message: 'Identifiant de demande invalide' }, { status: 400 });
            }

            await prisma.$transaction(async (tx) => {
                const bill = await tx.bill.findUnique({
                    where: { id: billId, isActive: true },
                    select: { state: true, clientId: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (bill.state !== 'DRAFT') throw new Error('BILL_NOT_DRAFT');

                // Mêmes contrôles que POST /api/bills, qui fait le même geste : les
                // deux chemins de rattachement doivent dire oui aux mêmes demandes.
                // Il manquait ici `isActive` (une demande supprimée pouvait être
                // rattachée, puis restait invisible — exclue du total ET des lignes)
                // et « Non facturable », que POST refuse explicitement et que
                // guardOrderUnbillableOnBill interdit de POSER sur une demande
                // rattachée : l'accepter par ici revenait à contourner le garde.
                const order = await tx.orders.findUnique({
                    where: { id: parseInt(orderId) },
                    select: { aveugleId: true, billId: true, isActive: true, billingStatus: true },
                });
                if (!order || !order.isActive) throw new Error('ORDER_NOT_FOUND');
                if (order.billId !== null) throw new Error('ORDER_ALREADY_BILLED');
                if (order.aveugleId !== bill.clientId) throw new Error('CLIENT_MISMATCH');
                if (order.billingStatus === OrderBillingStatus.UNBILLABLE) throw new Error('ORDER_UNBILLABLE');

                await tx.orders.update({
                    where: { id: parseInt(orderId) },
                    data: { billId, billingStatus: orderBillingForBillState(bill.state) },
                });

                await recomputeBillTotal(tx, billId);
                await logBillEvent(tx, {
                    billId,
                    type: 'ORDER_ATTACHED',
                    payload: { orderId: parseInt(orderId) },
                    performedById,
                });
            });

            return NextResponse.json({ message: 'Demande ajoutée à la facture' });
        }

        if (action === 'removeOrder') {
            const { orderId } = body;
            if (!orderId || isNaN(parseInt(orderId))) {
                return NextResponse.json({ error: 'Invalid orderId', message: 'Identifiant de demande invalide' }, { status: 400 });
            }

            await prisma.$transaction(async (tx) => {
                const bill = await tx.bill.findUnique({
                    where: { id: billId, isActive: true },
                    select: { state: true },
                });
                if (!bill) throw new Error('BILL_NOT_FOUND');
                if (bill.state !== 'DRAFT') throw new Error('BILL_NOT_DRAFT');

                // Confirm the order is actually on this bill, and read its workflow status.
                const order = await tx.orders.findFirst({
                    where: { id: parseInt(orderId), billId },
                    select: { statusId: true, billingStatus: true },
                });
                if (!order) throw new Error('ORDER_NOT_FOUND');

                // Detach + free it so it can be re-added elsewhere. Never leave it BILLED
                // with no billId (the "lost" state). A settled order (SOLDE) is de-settled
                // back to Terminé; an unfinished order keeps its status — we don't mark
                // in-progress work as finished just because it left a brouillon.
                const deSettled = order.statusId === STATUS.SOLDE;
                await tx.orders.update({
                    where: { id: parseInt(orderId), billId },
                    data: {
                        billId: null,
                        // « Non facturable » survit au détachement (detachedBillingStatus).
                        billingStatus: detachedBillingStatus(order.billingStatus),
                        ...(deSettled ? { statusId: STATUS.TERMINE } : {}),
                    },
                });

                await recomputeBillTotal(tx, billId);
                await logBillEvent(tx, {
                    billId,
                    type: 'ORDER_DETACHED',
                    payload: { orderId: parseInt(orderId), deSettled },
                    performedById,
                });
            });

            return NextResponse.json({ message: 'Demande retirée de la facture' });
        }

        // Enregistre la référence de paiement, et RIEN d'autre.
        //
        // Cette action faisait auparavant basculer un brouillon directement en
        // « Payée » (state PAID + issueDate + paymentDate du jour) dès qu'une
        // référence non vide y était saisie. Elle contournait ainsi la machine à
        // états de `updateStatus` juste au-dessus, qui n'autorise DRAFT que vers
        // BILLED : la facture était enregistrée payée un jour où elle n'avait
        // jamais été émise ni imprimée, son total n'était jamais recalculé, et
        // elle se retrouvait verrouillée (une facture PAID l'est) — seul
        // reopenBill pouvait la rouvrir.
        //
        // Une référence est une donnée SUR un paiement ; elle n'est pas le
        // paiement. Encaisser une facture passe par updateStatus, qui exige
        // déjà une référence pour PAID.
        if (action === 'updatePaymentReference') {
            const { paymentReference } = body;
            const trimmed = paymentReference?.trim() || null;
            const bill = await prisma.bill.findUnique({
                where: { id: billId, isActive: true },
                select: { id: true, state: true, paymentReference: true },
            });
            if (!bill) return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });

            // Une facture PAYÉE ou SOLDÉE ne peut pas se retrouver SANS référence.
            //
            // `updateStatus` refuse de passer une facture à PAID sans référence —
            // c'est l'invariant : une facture encaissée dit toujours par quoi. Cette
            // action, elle, acceptait une chaîne vide dans n'importe quel état, et le
            // crayon du modal est offert dans tous les états : vider le champ sur une
            // facture payée la ramenait exactement dans l'état que la transition
            // interdit, par la porte de derrière — « Non renseignée » sur une facture
            // qui annonce un règlement, et plus rien pour dire lequel.
            //
            // Corriger une référence reste permis dans tous les états — c'est ce à
            // quoi sert ce champ, et Bill étant un modèle audité, la valeur
            // précédente part au journal toute seule. La VIDER n'est permis que tant
            // que la facture n'annonce pas d'encaissement ; sur une facture réglée,
            // le chemin de sortie est reopenBill, qui archive la référence dans le
            // BillEvent avant de l'effacer.
            const clearing = trimmed === null;
            const settled = bill.state === BillingStatus.PAID || bill.state === BillingStatus.SOLDE;
            if (clearing && settled) {
                return NextResponse.json(
                    {
                        error: 'Reference required',
                        message:
                            `La facture #${billId} est ${getBillingStatusLabel(bill.state).toLowerCase()} : ` +
                            `elle doit garder un identifiant de paiement. Corrigez-le, ou rouvrez la facture ` +
                            `pour retirer son règlement.`,
                    },
                    { status: 409 }
                );
            }

            if (trimmed === bill.paymentReference) {
                return NextResponse.json({ message: 'Référence de paiement inchangée' });
            }

            await prisma.bill.update({
                where: { id: billId },
                data: { paymentReference: trimmed },
            });

            return NextResponse.json({ message: 'Référence de paiement mise à jour' });
        }

        return NextResponse.json({ error: 'Unknown action', message: 'Action inconnue' }, { status: 400 });
    } catch (error) {
        console.error('Error patching bill:', error);

        const msg = error instanceof Error ? error.message : '';
        const errorMap: Record<string, [string, number]> = {
            BILL_NOT_FOUND: ['Facture introuvable', 404],
            ORDER_NOT_FOUND: ['Demande introuvable', 404],
            BILL_NOT_DRAFT: ['La facture doit être en brouillon pour modifier ses demandes', 400],
            ORDER_ALREADY_BILLED: ['Cette demande est déjà rattachée à une facture', 400],
            CLIENT_MISMATCH: ['Cette demande n\'appartient pas au client de cette facture', 400],
            ORDER_UNBILLABLE: ['Cette demande est marquée « Non facturable » et ne peut pas être rattachée à une facture', 400],
        };
        if (errorMap[msg]) {
            return NextResponse.json({ error: msg, message: errorMap[msg][0] }, { status: errorMap[msg][1] });
        }

        return NextResponse.json(
            { error: 'Failed to update bill', message: 'Une erreur inattendue est survenue' },
            { status: 500 }
        );
    }
});

/**
 * Soft delete: mark the bill inactive AND unlink its orders (reset billId +
 * billingStatus).
 *
 * BROUILLON UNIQUEMENT — et c'est le cœur de la garde.
 *
 * Détacher les demandes les remet « Non facturé » et sans billId, donc en plein
 * dans ADJUSTABLE_ORDER_WHERE : elles redeviennent retarifables par
 * repriceOpenOrdersForBook ET elles se rattacheront au prochain brouillon de
 * l'auditeur à la première occasion. Sur un brouillon c'est exactement ce qu'on
 * veut — rien n'est jamais parti. Sur une facture émise, payée ou soldée, c'est
 * une double facturation : l'auditeur reçoit une seconde fois la note d'un
 * enregistrement qu'il a déjà réglé.
 *
 * Même frontière que partout ailleurs (billIsIssued, ADJUSTABLE_ORDER_WHERE,
 * DELETE /api/orders/[id]) : l'émission. Le chemin de sortie pour une facture
 * émise est de la rouvrir d'abord.
 */
export const DELETE = withAdmin(async (_request, { me, params }) => {
    revalidateAdmin();
    try {
        const performedById = me.id;

        const { id } = await params!;
        const billId = parseInt(id);
        if (isNaN(billId)) {
            return NextResponse.json({ error: 'Invalid id', message: 'Identifiant invalide' }, { status: 400 });
        }

        const existing = await prisma.bill.findUnique({
            where: { id: billId },
            select: { id: true, state: true, isActive: true },
        });
        if (!existing) {
            return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
        }

        if (existing.state !== BillingStatus.DRAFT) {
            return NextResponse.json(
                {
                    error: 'Bill not draft',
                    message:
                        `Impossible de supprimer la facture #${billId} : elle est ${getBillingStatusLabel(existing.state).toLowerCase()} ` +
                        `et ses demandes redeviendraient facturables, donc facturées une seconde fois. ` +
                        `Rouvrez la facture pour la ramener en brouillon avant de la supprimer.`,
                },
                { status: 409 }
            );
        }

        await prisma.$transaction(async (tx) => {
            // Detach orders and revert their order-level billing status (never leave them
            // BILLED with no billId). De-settle any SOLDE order back to Terminé so it's clean
            // to re-add, matching removeOrder's behavior.
            //
            // En trois temps, et dans cet ordre, parce que la sélection se fait par
            // billId : une fois détachées, les lignes ne sont plus retrouvables.
            await tx.orders.updateMany({
                where: { billId, statusId: STATUS.SOLDE },
                data: { statusId: STATUS.TERMINE },
            });
            // « Non facturable » garde sa décision — voir detachedBillingStatus.
            await tx.orders.updateMany({
                where: { billId, billingStatus: { not: 'UNBILLABLE' } },
                data: { billingStatus: 'UNBILLED' },
            });
            // Tout le monde se détache, y compris les non facturables : laisser une
            // ligne rattachée à une facture supprimée serait le vrai état perdu.
            await tx.orders.updateMany({
                where: { billId },
                data: { billId: null },
            });

            // Le total tombe à 0 avant l'événement, pour que amountAtEvent porte
            // l'état réel de la facture au moment où elle est supprimée.
            await recomputeBillTotal(tx, billId);

            await tx.bill.update({
                where: { id: billId },
                data: { isActive: false, deletedAt: new Date() },
            });

            // Sans cette ligne l'historique d'une facture s'arrêtait au milieu
            // d'une phrase : les demandes s'en allaient et rien ne le disait.
            await logBillEvent(tx, {
                billId,
                type: 'ORDER_DETACHED',
                payload: { reason: 'bill-deleted' },
                performedById,
            });
        });

        return NextResponse.json({ message: 'Facture supprimée avec succès' });
    } catch (error) {
        console.error('Error deleting bill:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return NextResponse.json({ error: 'Not found', message: 'Facture introuvable' }, { status: 404 });
        }

        return NextResponse.json(
            { error: 'Failed to delete bill', message: 'Une erreur inattendue est survenue', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
});