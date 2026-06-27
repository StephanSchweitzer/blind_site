import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    OrderQueryModeSchema,
    OrderIncludeRelationSchema,
    OrderIncludeConfig,
    basicOrderSelect,
    detailedOrderSelect,
    orderIncludeConfigs,
    OrderUpdateInput,
    OrderUpdateInputSchema,
} from '@/types';
import { Prisma, BillingStatus } from '@prisma/client';
import {
    STATUS,
    guardOrderCompletion,
    guardDuplicationFlip,
    syncAssignmentToStatus,
} from '@/lib/statusSync';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { recomputeBillTotal, accrueOrderToOpenDraft, issueDraftIfOverThreshold, logBillEvent } from '@/lib/billing';

async function checkAdmin() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return { authorized: false as const, response: NextResponse.json({ message: 'Non autorisé' }, { status: 401 }) };
    }
    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return { authorized: false as const, response: NextResponse.json({ message: 'Non autorisé' }, { status: 403 }) };
    }
    return { authorized: true as const, session };
}

// Reprint notice returned to the client when an invoice-relevant field changes on a
// non-DRAFT (issued) bill. COST = total recomputed; VISIBLE = printed field changed.
type BillNotice =
    | { billId: number; billState: BillingStatus; kind: 'COST'; newTotal: string | null }
    | { billId: number; billState: BillingStatus; kind: 'VISIBLE' };

// Normalize a cost input to a number or null (treats '' / null / undefined / NaN as null).
function parseCost(raw: unknown): number | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = parseFloat(String(raw));
    return Number.isNaN(n) ? null : n;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json(
                { message: 'ID de commande invalide' },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(request.url);
        const modeParam = searchParams.get('mode') || 'detailed';
        const includeParam = searchParams.get('include');

        const modeValidation = OrderQueryModeSchema.safeParse(modeParam);
        if (!modeValidation.success) {
            return NextResponse.json(
                { message: 'Mode invalide. Utilisez: basic, detailed, ou full' },
                { status: 400 }
            );
        }
        const mode = modeValidation.data;

        const includeRelations = includeParam
            ? includeParam.split(',').filter(Boolean).map(r => r.trim())
            : [];

        let select: Prisma.OrdersSelect | null = null;
        const include: OrderIncludeConfig = {};

        switch (mode) {
            case 'basic':
                select = basicOrderSelect;
                break;
            case 'detailed':
                select = detailedOrderSelect;
                include.aveugle = orderIncludeConfigs.aveugle;
                include.catalogue = orderIncludeConfigs.catalogue;
                include.status = orderIncludeConfigs.status;
                include.mediaFormat = orderIncludeConfigs.mediaFormat;
                include.processedByStaff = orderIncludeConfigs.processedByStaff;
                break;
            case 'full':
                select = null;
                break;
        }

        if (includeRelations.length > 0) {
            for (const relation of includeRelations) {
                const relationValidation = OrderIncludeRelationSchema.safeParse(relation);
                if (!relationValidation.success) continue;

                switch (relationValidation.data) {
                    case 'aveugle':
                        include.aveugle = orderIncludeConfigs.aveugle;
                        break;
                    case 'catalogue':
                        include.catalogue = orderIncludeConfigs.catalogue;
                        break;
                    case 'status':
                        include.status = orderIncludeConfigs.status;
                        break;
                    case 'mediaFormat':
                        include.mediaFormat = orderIncludeConfigs.mediaFormat;
                        break;
                    case 'processedByStaff':
                        include.processedByStaff = orderIncludeConfigs.processedByStaff;
                        break;
                    case 'bill':
                        include.bill = orderIncludeConfigs.bill;
                        break;
                    case 'assignments':
                        include.assignments = orderIncludeConfigs.assignments;
                        break;
                    case 'all':
                        Object.assign(include, orderIncludeConfigs.all);
                        break;
                }
            }
        }

        const order = await prisma.orders.findUnique({
            where: { id: orderId },
            ...(select && { select }),
            ...(Object.keys(include).length > 0 && { include }),
        });

        if (!order) {
            return NextResponse.json(
                { message: 'Commande non trouvée' },
                { status: 404 }
            );
        }

        return NextResponse.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de la commande' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await checkAdmin();
        if (!auth.authorized) return auth.response;
        const performedById = auth.session.user?.id ? parseInt(auth.session.user.id) : null;

        const { id } = await params;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json({ message: 'ID de commande invalide' }, { status: 400 });
        }

        const body: OrderUpdateInput = await request.json();

        const validation = OrderUpdateInputSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { message: 'Données invalides', errors: validation.error.issues },
                { status: 400 }
            );
        }

        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                statusId: true,
                isDuplication: true,
                billId: true,
                cost: true,
                catalogueId: true,
                requestReceivedDate: true,
                assignments: { select: { id: true, statusId: true }, take: 1 },
                bill: { select: { id: true, state: true } },
            },
        });

        if (!existingOrder) {
            return NextResponse.json({ message: 'Commande non trouvée' }, { status: 404 });
        }

        const data = validation.data;
        const assignment = existingOrder.assignments[0] ?? null;
        const billState = existingOrder.bill?.state ?? null;
        const hasBill = existingOrder.billId != null;

        // « Facturé » is system-controlled via bills; reject setting it on an order with no bill.
        if (data.billingStatus === 'BILLED' && existingOrder.billId == null) {
            return NextResponse.json(
                { message: "Une commande ne peut pas être marquée « Facturé » manuellement : ce statut provient d'une facture." },
                { status: 400 }
            );
        }

        // A non-duplication order can't reach Terminé/Soldé without a finished assignment.
        if (data.statusId !== undefined) {
            const completionGuard = guardOrderCompletion({
                statusId: data.statusId,
                isDuplication: data.isDuplication ?? existingOrder.isDuplication,
                assignmentStatusId: assignment?.statusId ?? null,
            });
            if (!completionGuard.ok) {
                return NextResponse.json({ message: completionGuard.message }, { status: completionGuard.httpStatus });
            }
        }

        // Can't flip an order to a duplication once it has an assignment.
        if (data.isDuplication !== undefined) {
            const flipGuard = guardDuplicationFlip(data.isDuplication, assignment !== null);
            if (!flipGuard.ok) {
                return NextResponse.json({ message: flipGuard.message }, { status: flipGuard.httpStatus });
            }
        }

        // ── Detect invoice-relevant changes ──────────────────────────────────────
        const oldCost = existingOrder.cost != null ? Number(existingOrder.cost) : null;
        const newCost = parseCost(data.cost);
        const costChanged = data.cost !== undefined && newCost !== oldCost;

        const catalogueChanged = data.catalogueId !== undefined && data.catalogueId !== existingOrder.catalogueId;
        const dupChanged = data.isDuplication !== undefined && data.isDuplication !== existingOrder.isDuplication;
        const dateChanged =
            data.requestReceivedDate !== undefined &&
            new Date(data.requestReceivedDate).getTime() !== existingOrder.requestReceivedDate.getTime();
        const visibleChanged = catalogueChanged || dupChanged || dateChanged;

        // ── Cost lock: cannot change cost while the bill is PAID or SOLDE ────────
        if (costChanged && hasBill && (billState === BillingStatus.PAID || billState === BillingStatus.SOLDE)) {
            return NextResponse.json(
                {
                    message: `Le coût ne peut pas être modifié : la facture #${existingOrder.billId} est ${
                        billState === BillingStatus.PAID ? 'payée' : 'soldée'
                    }. Rouvrez la facture pour la rendre modifiable.`,
                },
                { status: 409 }
            );
        }

        const updateData: Prisma.OrdersUncheckedUpdateInput = {
            aveugleId: data.aveugleId,
            catalogueId: data.catalogueId,
            requestReceivedDate: data.requestReceivedDate ? new Date(data.requestReceivedDate) : undefined,
            statusId: data.statusId,
            isDuplication: data.isDuplication,
            mediaFormatId: data.mediaFormatId,
            deliveryMethod: data.deliveryMethod,
            lentPhysicalBook: data.lentPhysicalBook,
            processedByStaffId: data.processedByStaffId || null,
            createdDate: data.createdDate ? new Date(data.createdDate) : null,
            closureDate: data.closureDate ? new Date(data.closureDate) : null,
            cost: data.cost !== undefined ? newCost : undefined,
            billingStatus: data.billingStatus,
            // billId is intentionally NOT set here: an order's bill membership is managed
            // by the bill route (addOrder/removeOrder) and by accrual — never by an order edit.
            notes: data.notes || null,
        };

        const { order, newTotal } = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.update({
                where: { id: orderId },
                data: updateData,
                include: {
                    aveugle: orderIncludeConfigs.aveugle,
                    catalogue: orderIncludeConfigs.catalogue,
                    status: orderIncludeConfigs.status,
                    mediaFormat: orderIncludeConfigs.mediaFormat,
                    processedByStaff: orderIncludeConfigs.processedByStaff,
                },
            });

            let newTotal: Prisma.Decimal | null = null;

            // Cost changed on a billed order → keep the bill total in sync + audit it.
            if (costChanged && existingOrder.billId != null) {
                newTotal = await recomputeBillTotal(tx, existingOrder.billId);
                await logBillEvent(tx, {
                    billId: existingOrder.billId,
                    type: 'AMOUNT_CHANGED',
                    payload: { orderId, previousCost: oldCost, newCost, newTotal: newTotal.toString() },
                    performedById,
                });
            }

            // Invariant: a non-UNBILLABLE order must sit on a brouillon. Heals any orphan
            // (legacy row, UNBILLABLE→UNBILLED, cost set after creation). No-op otherwise.
            if (existingOrder.billId == null) {
                await accrueOrderToOpenDraft(tx, orderId, performedById);
            }

            // A DRAFT may have crossed the seuil (new cost, or a freshly accrued order).
            // Skip issued bills (BILLED/PAID/SOLDE) — those go through the reprint path below.
            if (existingOrder.billId == null || billState === BillingStatus.DRAFT) {
                await issueDraftIfOverThreshold(tx, order.aveugleId, performedById);
            }

            // Propagate 1–3 down to the assignment; SOLDE stays order-only.
            if (
                assignment &&
                typeof data.statusId === 'number' &&
                data.statusId !== STATUS.SOLDE &&
                data.statusId !== assignment.statusId
            ) {
                await syncAssignmentToStatus(tx, assignment.id, data.statusId);
            }

            return { order, newTotal };
        });

        // Reprint notice for issued bills (never for DRAFT — nothing has been sent).
        let billNotice: BillNotice | null = null;
        if (hasBill && existingOrder.billId != null && billState && billState !== BillingStatus.DRAFT) {
            if (costChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'COST', newTotal: newTotal?.toString() ?? null };
            } else if (visibleChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'VISIBLE' };
            }
        }

        return NextResponse.json({ message: 'Commande mise à jour avec succès', order, billNotice });
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la commande' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await checkAdmin();
        if (!auth.authorized) return auth.response;
        const performedById = auth.session.user?.id ? parseInt(auth.session.user.id) : null;

        const { id } = await params;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json({ message: 'ID de commande invalide' }, { status: 400 });
        }

        const body: OrderUpdateInput = await request.json();

        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                statusId: true,
                isDuplication: true,
                billId: true,
                cost: true,
                catalogueId: true,
                requestReceivedDate: true,
                assignments: { select: { id: true, statusId: true }, take: 1 },
                bill: { select: { id: true, state: true } },
            },
        });

        if (!existingOrder) {
            return NextResponse.json({ message: 'Commande non trouvée' }, { status: 404 });
        }

        const assignment = existingOrder.assignments[0] ?? null;
        const billState = existingOrder.bill?.state ?? null;
        const hasBill = existingOrder.billId != null;

        // « Facturé » is system-controlled via bills; reject setting it on an order with no bill.
        if (body.billingStatus === 'BILLED' && existingOrder.billId == null) {
            return NextResponse.json(
                { message: "Une commande ne peut pas être marquée « Facturé » manuellement : ce statut provient d'une facture." },
                { status: 400 }
            );
        }

        // A non-duplication order can't reach Terminé/Soldé without a finished assignment.
        if (body.statusId !== undefined) {
            const completionGuard = guardOrderCompletion({
                statusId: body.statusId,
                isDuplication: body.isDuplication ?? existingOrder.isDuplication,
                assignmentStatusId: assignment?.statusId ?? null,
            });
            if (!completionGuard.ok) {
                return NextResponse.json({ message: completionGuard.message }, { status: completionGuard.httpStatus });
            }
        }

        // Can't flip an order to a duplication once it has an assignment.
        if (body.isDuplication !== undefined) {
            const flipGuard = guardDuplicationFlip(body.isDuplication, assignment !== null);
            if (!flipGuard.ok) {
                return NextResponse.json({ message: flipGuard.message }, { status: flipGuard.httpStatus });
            }
        }

        // ── Detect invoice-relevant changes ──────────────────────────────────────
        const oldCost = existingOrder.cost != null ? Number(existingOrder.cost) : null;
        const newCost = parseCost(body.cost);
        const costChanged = body.cost !== undefined && newCost !== oldCost;

        const catalogueChanged = body.catalogueId !== undefined && body.catalogueId !== existingOrder.catalogueId;
        const dupChanged = body.isDuplication !== undefined && body.isDuplication !== existingOrder.isDuplication;
        const dateChanged =
            body.requestReceivedDate !== undefined &&
            new Date(body.requestReceivedDate).getTime() !== existingOrder.requestReceivedDate.getTime();
        const visibleChanged = catalogueChanged || dupChanged || dateChanged;

        // ── Cost lock: cannot change cost while the bill is PAID or SOLDE ────────
        if (costChanged && hasBill && (billState === BillingStatus.PAID || billState === BillingStatus.SOLDE)) {
            return NextResponse.json(
                {
                    message: `Le coût ne peut pas être modifié : la facture #${existingOrder.billId} est ${
                        billState === BillingStatus.PAID ? 'payée' : 'soldée'
                    }. Rouvrez la facture pour la rendre modifiable.`,
                },
                { status: 409 }
            );
        }

        const updateData: Prisma.OrdersUncheckedUpdateInput = {};

        if (body.aveugleId !== undefined) updateData.aveugleId = body.aveugleId;
        if (body.catalogueId !== undefined) updateData.catalogueId = body.catalogueId;
        if (body.requestReceivedDate !== undefined) updateData.requestReceivedDate = new Date(body.requestReceivedDate);
        if (body.statusId !== undefined) updateData.statusId = body.statusId;
        if (body.isDuplication !== undefined) updateData.isDuplication = body.isDuplication;
        if (body.mediaFormatId !== undefined) updateData.mediaFormatId = body.mediaFormatId;
        if (body.deliveryMethod !== undefined) updateData.deliveryMethod = body.deliveryMethod;
        if (body.processedByStaffId !== undefined) updateData.processedByStaffId = body.processedByStaffId || null;
        if (body.createdDate !== undefined) updateData.createdDate = body.createdDate ? new Date(body.createdDate) : null;
        if (body.closureDate !== undefined) updateData.closureDate = body.closureDate ? new Date(body.closureDate) : null;
        if (body.cost !== undefined) updateData.cost = newCost;
        if (body.billingStatus !== undefined) updateData.billingStatus = body.billingStatus;
        // billId intentionally omitted — bill membership is managed by the bill route, not order edits.
        if (body.lentPhysicalBook !== undefined) updateData.lentPhysicalBook = body.lentPhysicalBook;
        if (body.notes !== undefined) updateData.notes = body.notes || null;

        const { order, newTotal } = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.update({
                where: { id: orderId },
                data: updateData,
                include: {
                    aveugle: orderIncludeConfigs.aveugle,
                    catalogue: orderIncludeConfigs.catalogue,
                    status: orderIncludeConfigs.status,
                    mediaFormat: orderIncludeConfigs.mediaFormat,
                    processedByStaff: orderIncludeConfigs.processedByStaff,
                },
            });

            let newTotal: Prisma.Decimal | null = null;

            // Cost changed on a billed order → keep the bill total in sync + audit it.
            if (costChanged && existingOrder.billId != null) {
                newTotal = await recomputeBillTotal(tx, existingOrder.billId);
                await logBillEvent(tx, {
                    billId: existingOrder.billId,
                    type: 'AMOUNT_CHANGED',
                    payload: { orderId, previousCost: oldCost, newCost, newTotal: newTotal.toString() },
                    performedById,
                });
            }

            // Invariant: a non-UNBILLABLE order must sit on a brouillon. Heals any orphan
            // (legacy row, UNBILLABLE→UNBILLED, cost set after creation). No-op otherwise.
            if (existingOrder.billId == null) {
                await accrueOrderToOpenDraft(tx, orderId, performedById);
            }

            // A DRAFT may have crossed the seuil (new cost, or a freshly accrued order).
            // Skip issued bills (BILLED/PAID/SOLDE) — those go through the reprint path below.
            if (existingOrder.billId == null || billState === BillingStatus.DRAFT) {
                await issueDraftIfOverThreshold(tx, order.aveugleId, performedById);
            }

            // Propagate 1–3 down to the assignment; SOLDE stays order-only.
            if (
                assignment &&
                typeof body.statusId === 'number' &&
                body.statusId !== STATUS.SOLDE &&
                body.statusId !== assignment.statusId
            ) {
                await syncAssignmentToStatus(tx, assignment.id, body.statusId);
            }

            return { order, newTotal };
        });

        let billNotice: BillNotice | null = null;
        if (hasBill && existingOrder.billId != null && billState && billState !== BillingStatus.DRAFT) {
            if (costChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'COST', newTotal: newTotal?.toString() ?? null };
            } else if (visibleChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'VISIBLE' };
            }
        }

        return NextResponse.json({ message: 'Commande mise à jour avec succès', order, billNotice });
    } catch (error) {
        console.error('Error patching order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la commande' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await checkAdmin();
        if (!auth.authorized) return auth.response;

        const { id } = await params;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json({ message: 'ID de commande invalide' }, { status: 400 });
        }

        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                billId: true,
                bill: { select: { id: true, state: true } },
                _count: { select: { assignments: true } },
            },
        });

        if (!existingOrder) {
            return NextResponse.json({ message: 'Commande non trouvée' }, { status: 404 });
        }

        // Can't delete an order off an issued bill — it would silently alter the invoice.
        if (existingOrder.bill && existingOrder.bill.state !== BillingStatus.DRAFT) {
            return NextResponse.json(
                {
                    message: `Impossible de supprimer cette demande : elle est rattachée à la facture #${existingOrder.bill.id}, déjà émise. Détachez-la de la facture (brouillon) ou rouvrez la facture d'abord.`,
                },
                { status: 409 }
            );
        }

        if (existingOrder._count.assignments > 0) {
            return NextResponse.json(
                {
                    message: "Impossible de supprimer la demande car une attribution y est associée. Veuillez d'abord supprimer l'affectation.",
                    hasAssignments: true,
                    assignmentCount: existingOrder._count.assignments,
                },
                { status: 400 }
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.orders.delete({ where: { id: orderId } });
            // Deleting a billed order changes its bill's total — keep it in sync.
            if (existingOrder.billId != null) {
                await recomputeBillTotal(tx, existingOrder.billId);
            }
        });

        return NextResponse.json({
            message: 'Commande supprimée avec succès',
            deletedId: orderId,
        });
    } catch (error) {
        console.error('Error deleting order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de la commande' },
            { status: 500 }
        );
    }
}