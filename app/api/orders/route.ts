import { NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import { Prisma, OrderBillingStatus } from '@prisma/client';
import { accrueOrderToOpenDraft, issueDraftIfOverThreshold } from '@/lib/billing';
import { STATUS, guardOrderStatus, guardDuplicationStatus, guardOrderCompletion, guardManualEnCours, resolveClosureDate, guardClosureDateRequiresTermine, logOrderEvent } from '@/lib/statusSync';
import { guardUserIsActive } from '@/lib/users/activityGuard';
import { withAdmin } from '@/lib/auth/guards';
import { normalizeSearchQuery, parseEntityId } from '@/lib/search-query';
import { buildOrderSearchWhere } from '@/lib/search';
import { parsePageParam, parseLimitParam, pageSkip } from '@/lib/pagination';

/**
 * Shape of a demande in a list response. Hoisted out of the query so the
 * exact-id lookup below can return the identical shape without restating it.
 */
const ORDER_LIST_SELECT = {
    id: true,
    aveugleId: true,
    catalogueId: true,
    requestReceivedDate: true,
    statusId: true,
    isDuplication: true,
    mediaFormatId: true,
    deliveryMethod: true,
    processedByStaffId: true,
    createdDate: true,
    closureDate: true,
    updatedAt: true,
    cost: true,
    billingStatus: true,
    lentPhysicalBook: true,
    notes: true,
    aveugle: {
        select: { name: true, email: true },
    },
    catalogue: {
        select: { title: true, author: true },
    },
    status: {
        select: { name: true },
    },
    mediaFormat: {
        select: { name: true },
    },
    // Lets the assignment form grey out orders that already have an
    // attribution (one-assignment-per-order is enforced server-side).
    _count: {
        select: { assignments: true },
    },
} satisfies Prisma.OrdersSelect;

export const GET = withAdmin(async (request) => {
    try {
        const searchParams = request.nextUrl.searchParams;
        const page = parsePageParam(searchParams.get('page'));
        // Normalized so a « #1234 » pasted out of « Modifier la demande #1234 »
        // resolves to that demande instead of returning nothing.
        const search = normalizeSearchQuery(searchParams.get('search') || '');
        const filter = searchParams.get('filter') || 'all';
        const statusId = searchParams.get('statusId');
        const rawBillingStatus = searchParams.get('billingStatus');
        const isDuplication = searchParams.get('isDuplication');
        const retard = searchParams.get('retard');

        // The attribution picker has always asked for `limit=50`; this route
        // ignored the parameter and served 10, which is why staff reported the
        // results list as too short no matter how tall it was drawn. Capped at
        // 100 so a hand-written URL can't ask for the whole table.
        const ordersPerPage = parseLimitParam(searchParams.get('limit'), 10);

        const whereClause: Prisma.OrdersWhereInput = {};

        // The query read as a demande number, « # » and a typed « demande »
        // prefix included. Hoisted out of the search block because the
        // exact-match promotion after the query needs it too.
        const entityId = search ? parseEntityId(search) : null;

        // Search filter — tokens AND-ed, each satisfiable by the auditeur, the
        // book, or the number, so « bernard morvan instructions » finds the one
        // demande naming that person and that title. See buildOrderSearchWhere.
        if (search) {
            const tokenClauses = buildOrderSearchWhere(search);
            if (tokenClauses) whereClause.AND = tokenClauses;
        }

        // Special filters
        if (filter === 'needsReturn') {
            const existingConditions = whereClause.AND
                ? (Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND])
                : [];
            whereClause.AND = [
                ...existingConditions,
                { lentPhysicalBook: true },
                { closureDate: null },
            ];
        } else if (filter === 'late') {
            const existingConditions = whereClause.AND
                ? (Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND])
                : [];
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            whereClause.AND = [
                ...existingConditions,
                { requestReceivedDate: { lt: thirtyDaysAgo } },
                { closureDate: null },
            ];
        }

        // Status filter
        if (statusId && statusId !== 'all') {
            whereClause.statusId = parseInt(statusId);
        }

        // Billing status filter — validate against enum before applying
        if (rawBillingStatus && rawBillingStatus !== 'all') {
            if (!Object.values(OrderBillingStatus).includes(rawBillingStatus as OrderBillingStatus)) {
                return NextResponse.json(
                    {
                        error: 'Invalid billing status',
                        message: `billingStatus must be one of: ${Object.values(OrderBillingStatus).join(', ')}`,
                    },
                    { status: 400 }
                );
            }
            whereClause.billingStatus = rawBillingStatus as OrderBillingStatus;
        }

        // Unbilled filter — for bill order assignment (no bill, status UNBILLED)
        const unbilled = searchParams.get('unbilled');
        if (unbilled === 'true') {
            whereClause.billId = null;
            whereClause.billingStatus = OrderBillingStatus.UNBILLED;
        }

        // aveugleId filter — for scoping order search to a specific client
        const aveugleIdParam = searchParams.get('aveugleId');
        if (aveugleIdParam) {
            const parsedAveugleId = parseInt(aveugleIdParam);
            if (!isNaN(parsedAveugleId)) whereClause.aveugleId = parsedAveugleId;
        }

        // Duplication filter
        if (isDuplication === 'true') {
            whereClause.isDuplication = true;
        } else if (isDuplication === 'false') {
            whereClause.isDuplication = false;
        }

        // Unassigned filter — opt-in. Used by the assignment form's "recent
        // actionable" list: exclude demandes that already have an attribution
        // (one-per-demande), so the 10 slots backfill with older still-attributable
        // demandes instead of thinning out. Default behaviour is unchanged.
        const unassigned = searchParams.get('unassigned');
        if (unassigned === 'true') {
            whereClause.assignments = { none: {} };
        }

        // Retard filter (orders >3 months old and not closed)
        if (retard === 'true') {
            const existingConditions = whereClause.AND
                ? (Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND])
                : [];
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            whereClause.AND = [
                ...existingConditions,
                { requestReceivedDate: { lt: threeMonthsAgo } },
                { statusId: { not: 3 } },
            ];
        } else if (retard === 'false') {
            const existingConditions = whereClause.AND
                ? (Array.isArray(whereClause.AND) ? whereClause.AND : [whereClause.AND])
                : [];
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            whereClause.AND = [
                ...existingConditions,
                {
                    OR: [
                        { requestReceivedDate: { gte: threeMonthsAgo } },
                        { statusId: 3 },
                    ]
                }
            ];
        }

        // Opt-in ordering for the attribution picker only — the /admin/orders
        // table stays purely chronological.
        //
        // In search mode the picker shows every matching demande, greying out
        // the ones that can't take an attribution (duplication, or already
        // attributed). Interleaved by date, a search could fill the visible
        // rows with greyed entries and read as "no results" — so push the
        // selectable ones to the top. Date still decides within each group.
        const attributableFirst = searchParams.get('attributableFirst') === 'true';
        const orderBy: Prisma.OrdersOrderByWithRelationInput[] = attributableFirst
            ? [
                { isDuplication: 'asc' },
                { assignments: { _count: 'asc' } },
                { requestReceivedDate: 'desc' },
            ]
            : [{ requestReceivedDate: 'desc' }];

        const [orders, totalOrders] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                orderBy,
                skip: pageSkip(page, ordersPerPage),
                take: ordersPerPage,
                select: ORDER_LIST_SELECT,
            }),
            prisma.orders.count({ where: whereClause }),
        ]);

        // Asking for a demande by its number is unambiguous in a way no name
        // search is, so that row leads the page — otherwise the sort above
        // (date, or attributable-first) buries the one demande the admin
        // actually asked for somewhere down a 50-row list, or past its end
        // entirely. `page === 1` because promoting it onto every page would
        // duplicate it as the user pages through.
        let pageOrders = orders;
        if (entityId !== null && page === 1) {
            const index = pageOrders.findIndex((o) => o.id === entityId);
            if (index > 0) {
                pageOrders = [
                    pageOrders[index],
                    ...pageOrders.filter((_, i) => i !== index),
                ];
            } else if (index === -1) {
                // It satisfies the filters but sorted past the end of the page.
                const exact = await prisma.orders.findFirst({
                    where: { AND: [{ id: entityId }, whereClause] },
                    select: ORDER_LIST_SELECT,
                });
                if (exact) pageOrders = [exact, ...pageOrders.slice(0, -1)];
            }
        }

        return NextResponse.json({
            orders: pageOrders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch orders', message: 'Erreur lors de la récupération des demandes' },
            { status: 500 }
        );
    }
});

export const POST = withAdmin(async (request, { me }) => {
    revalidateAdmin();
    try {
        const body = await request.json();

        // ---- Batch creation: one order per book (fan-out) ----
        if (Array.isArray(body.books)) {
            const { aveugleId, requestReceivedDate, deliveryMethod, billingStatus, notes, books } = body;

            if (!aveugleId || !requestReceivedDate || !deliveryMethod) {
                return NextResponse.json(
                    { error: 'Missing required fields', message: 'Auditeur, date de réception et méthode de livraison sont obligatoires' },
                    { status: 400 }
                );
            }
            if (books.length === 0) {
                return NextResponse.json(
                    { error: 'No books', message: 'Ajoutez au moins un ouvrage' },
                    { status: 400 }
                );
            }

            // An inactive auditeur can't have new demandes attributed to them —
            // the admin must reactivate them first (see lib/users/activityGuard.ts).
            const batchActivityGuard = await guardUserIsActive(parseInt(String(aveugleId)), 'aveugle');
            if (!batchActivityGuard.ok) {
                return NextResponse.json(
                    { message: batchActivityGuard.message, blocked: batchActivityGuard.blocked },
                    { status: batchActivityGuard.httpStatus }
                );
            }

            // Parse the shared request date once
            let batchReceivedDate: Date;
            try {
                batchReceivedDate = new Date(requestReceivedDate);
                if (isNaN(batchReceivedDate.getTime())) throw new Error('Invalid date');
            } catch (dateError) {
                console.error('Invalid requestReceivedDate:', requestReceivedDate, dateError);
                return NextResponse.json(
                    { error: 'Invalid date format', message: 'La date de demande est invalide', field: 'requestReceivedDate' },
                    { status: 400 }
                );
            }

            // Validate shared billing status
            const batchBillingStatus: OrderBillingStatus = billingStatus || OrderBillingStatus.UNBILLED;
            if (!Object.values(OrderBillingStatus).includes(batchBillingStatus)) {
                return NextResponse.json(
                    {
                        error: 'Invalid billing status',
                        message: `Le statut de facturation est invalide. Valeurs acceptées: ${Object.values(OrderBillingStatus).join(', ')}`,
                        field: 'billingStatus',
                    },
                    { status: 400 }
                );
            }
            if (batchBillingStatus === OrderBillingStatus.BILLED) {
                return NextResponse.json(
                    {
                        error: 'Cannot set BILLED',
                        message: "Une demande ne peut pas être marquée « Facturé » manuellement : ce statut provient d'une facture.",
                        field: 'billingStatus',
                    },
                    { status: 400 }
                );
            }

            // Validate + prepare each line (returns 400 on any bad line)
            const preparedLines: {
                catalogueId: number;
                statusId: number;
                mediaFormatId: number;
                isDuplication: boolean;
                lentPhysicalBook: boolean;
                cost: Prisma.Decimal | null;
                closureDate: Date | null;
            }[] = [];

            for (const b of books) {
                if (!b.catalogueId || !b.statusId || !b.mediaFormatId) {
                    return NextResponse.json(
                        { error: 'Missing fields in book line', message: 'Chaque ouvrage doit comporter un livre, un statut et un format média' },
                        { status: 400 }
                    );
                }

                const lineStatusId = parseInt(String(b.statusId));

                // « Soldé » is a facture status — a demande can never be created with it.
                const lineStatusGuard = guardOrderStatus(lineStatusId);
                if (!lineStatusGuard.ok) {
                    return NextResponse.json(
                        { error: 'Invalid status', message: lineStatusGuard.message, field: 'statusId' },
                        { status: lineStatusGuard.httpStatus }
                    );
                }

                // « À faire » is duplication-only, and a duplication can hold nothing else
                // (bar « Terminé ») — it never goes to a lecteur.
                const lineDuplicationGuard = guardDuplicationStatus(!!b.isDuplication, lineStatusId);
                if (!lineDuplicationGuard.ok) {
                    return NextResponse.json(
                        { error: 'Invalid status', message: lineDuplicationGuard.message, field: 'statusId' },
                        { status: lineDuplicationGuard.httpStatus }
                    );
                }

                // A demande d'enregistrement can't be BORN closed. It is created
                // before its attribution exists, so `assignmentStatusId` is null by
                // construction here and any non-duplication line asking for
                // « Terminé » / « Attente envoi vers auditeur » is refused — the same
                // rule the PUT route enforces, which creation used to slip past. That
                // gap mattered: such a line accrued straight onto a brouillon at the
                // tarif plancher, with no attribution and therefore no audio behind it.
                const lineCompletionGuard = guardOrderCompletion({
                    statusId: lineStatusId,
                    isDuplication: !!b.isDuplication,
                    assignmentStatusId: null,
                });
                if (!lineCompletionGuard.ok) {
                    return NextResponse.json(
                        { error: 'Invalid status', message: lineCompletionGuard.message, field: 'statusId' },
                        { status: lineCompletionGuard.httpStatus }
                    );
                }

                // A demande is created before its attribution exists, so « En cours »
                // — which describes a livre déjà parti chez un lecteur — can never be
                // true of a brand-new one.
                const lineEnCoursGuard = guardManualEnCours({
                    statusId: lineStatusId,
                    isDuplication: !!b.isDuplication,
                    hasAssignment: false,
                });
                if (!lineEnCoursGuard.ok) {
                    return NextResponse.json(
                        { error: 'Invalid status', message: lineEnCoursGuard.message, field: 'statusId' },
                        { status: lineEnCoursGuard.httpStatus }
                    );
                }

                let lineCost: Prisma.Decimal | null = null;
                if (b.cost !== null && b.cost !== undefined && b.cost !== '') {
                    try {
                        const d = new Prisma.Decimal(b.cost);
                        if (d.isNaN()) throw new Error('Invalid cost');
                        lineCost = d;
                    } catch (costError) {
                        console.error('Invalid cost in batch line:', b.cost, costError);
                        return NextResponse.json(
                            { error: 'Invalid cost format', message: 'Le coût d\'un ouvrage est invalide', field: 'cost' },
                            { status: 400 }
                        );
                    }
                }

                preparedLines.push({
                    catalogueId: parseInt(String(b.catalogueId)),
                    statusId: lineStatusId,
                    mediaFormatId: parseInt(String(b.mediaFormatId)),
                    isDuplication: !!b.isDuplication,
                    lentPhysicalBook: !!b.lentPhysicalBook,
                    cost: lineCost,
                    // A line created straight into « Terminé » is closed today.
                    closureDate:
                        resolveClosureDate({
                            previousStatusId: null,
                            nextStatusId: lineStatusId,
                            explicitClosureDate: undefined,
                        }) ?? null,
                });
            }

            const batchNow = new Date();
            const batchStaffId = me.id;
            const batchAveugleId = parseInt(String(aveugleId));

            const { created, autoBill } = await prisma.$transaction(async (tx) => {
                const createdOrders: { id: number }[] = [];
                let anyAccrued = false;
                for (const l of preparedLines) {
                    const o = await tx.orders.create({
                        data: {
                            aveugleId: batchAveugleId,
                            catalogueId: l.catalogueId,
                            requestReceivedDate: batchReceivedDate,
                            statusId: l.statusId,
                            isDuplication: l.isDuplication,
                            mediaFormatId: l.mediaFormatId,
                            deliveryMethod: deliveryMethod as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE',
                            processedByStaffId: batchStaffId,
                            createdDate: batchNow,
                            updatedAt: batchNow,
                            closureDate: l.closureDate,
                            cost: l.cost,
                            billingStatus: batchBillingStatus,
                            lentPhysicalBook: l.lentPhysicalBook,
                            notes: notes || null,
                        },
                        select: { id: true },
                    });
                    createdOrders.push(o);
                    await logOrderEvent(tx, {
                        orderId: o.id,
                        type: 'CREATED',
                        toStatusId: l.statusId,
                        performedById: batchStaffId,
                    });
                    // Billing happens when the service is rendered, not on creation.
                    // After guardOrderCompletion above, a line born « Terminé » can
                    // only be a duplication handled on the spot — its enregistrement
                    // already exists, so its tarif is already known and accruing it
                    // now bills the right amount.
                    if (l.statusId === STATUS.TERMINE) {
                        await accrueOrderToOpenDraft(tx, o.id, batchStaffId);
                        anyAccrued = true;
                    }
                }

                // Issue the open draft once if the batch pushed it over the seuil.
                const auto = anyAccrued
                    ? await issueDraftIfOverThreshold(tx, batchAveugleId, batchStaffId)
                    : null;
                return { created: createdOrders, autoBill: auto };
            });

            return NextResponse.json(
                {
                    orderIds: created.map((o) => o.id),
                    message: `${created.length} demande(s) créée(s) avec succès`,
                    autoBill,
                },
                { status: 201 }
            );
        }

        const {
            aveugleId,
            catalogueId,
            requestReceivedDate,
            statusId,
            isDuplication,
            mediaFormatId,
            deliveryMethod,
            closureDate,
            cost,
            billingStatus,
            lentPhysicalBook,
            notes,
        } = body;

        // Required field validation
        if (!aveugleId || !catalogueId || !requestReceivedDate || !statusId || !mediaFormatId || !deliveryMethod) {
            return NextResponse.json(
                {
                    error: 'Missing required fields',
                    message: 'Tous les champs obligatoires doivent être remplis',
                    required: ['aveugleId', 'catalogueId', 'requestReceivedDate', 'statusId', 'mediaFormatId', 'deliveryMethod'],
                },
                { status: 400 }
            );
        }

        const parsedStatusId = parseInt(statusId);

        // « Soldé » is a facture status — a demande can never be created with it.
        const orderStatusGuard = guardOrderStatus(parsedStatusId);
        if (!orderStatusGuard.ok) {
            return NextResponse.json(
                { error: 'Invalid status', message: orderStatusGuard.message, field: 'statusId' },
                { status: orderStatusGuard.httpStatus }
            );
        }

        // « À faire » is duplication-only, and a duplication can hold nothing else
        // (bar « Terminé ») — it never goes to a lecteur.
        const duplicationStatusGuard = guardDuplicationStatus(!!isDuplication, parsedStatusId);
        if (!duplicationStatusGuard.ok) {
            return NextResponse.json(
                { error: 'Invalid status', message: duplicationStatusGuard.message, field: 'statusId' },
                { status: duplicationStatusGuard.httpStatus }
            );
        }

        // A demande d'enregistrement can't be BORN closed — see the batch path above
        // for why this matters to billing. No attribution can exist yet at creation,
        // so `assignmentStatusId` is null by construction.
        const completionGuard = guardOrderCompletion({
            statusId: parsedStatusId,
            isDuplication: !!isDuplication,
            assignmentStatusId: null,
        });
        if (!completionGuard.ok) {
            return NextResponse.json(
                { error: 'Invalid status', message: completionGuard.message, field: 'statusId' },
                { status: completionGuard.httpStatus }
            );
        }

        // A demande is created before its attribution exists, so « En cours » — which
        // describes a livre déjà parti chez un lecteur — can never be true of a
        // brand-new one.
        const enCoursGuard = guardManualEnCours({
            statusId: parsedStatusId,
            isDuplication: !!isDuplication,
            hasAssignment: false,
        });
        if (!enCoursGuard.ok) {
            return NextResponse.json(
                { error: 'Invalid status', message: enCoursGuard.message, field: 'statusId' },
                { status: enCoursGuard.httpStatus }
            );
        }

        // An inactive auditeur can't have a new demande attributed to them —
        // the admin must reactivate them first (see lib/users/activityGuard.ts).
        const activityGuard = await guardUserIsActive(parseInt(String(aveugleId)), 'aveugle');
        if (!activityGuard.ok) {
            return NextResponse.json(
                { message: activityGuard.message, blocked: activityGuard.blocked },
                { status: activityGuard.httpStatus }
            );
        }

        // Parse requestReceivedDate
        let parsedRequestReceivedDate: Date;
        try {
            parsedRequestReceivedDate = new Date(requestReceivedDate);
            if (isNaN(parsedRequestReceivedDate.getTime())) throw new Error('Invalid date');
        } catch (dateError) {
            console.error('Invalid requestReceivedDate:', requestReceivedDate, dateError);
            return NextResponse.json(
                { error: 'Invalid date format', message: 'La date de demande est invalide', field: 'requestReceivedDate' },
                { status: 400 }
            );
        }

        // Parse closureDate
        let parsedClosureDate: Date | null = null;
        if (closureDate) {
            try {
                parsedClosureDate = new Date(closureDate);
                if (isNaN(parsedClosureDate.getTime())) throw new Error('Invalid date');
            } catch (dateError) {
                console.error('Invalid closureDate:', closureDate, dateError);
                return NextResponse.json(
                    { error: 'Invalid date format', message: 'La date d\'envoie est invalide', field: 'closureDate' },
                    { status: 400 }
                );
            }
        }

        // Parse cost
        let parsedCost: Prisma.Decimal | null = null;
        if (cost !== null && cost !== undefined && cost !== '') {
            try {
                parsedCost = new Prisma.Decimal(cost);
                if (parsedCost.isNaN()) throw new Error('Invalid cost');
            } catch (costError) {
                console.error('Invalid cost:', cost, costError);
                return NextResponse.json(
                    { error: 'Invalid cost format', message: 'Le coût est invalide', field: 'cost' },
                    { status: 400 }
                );
            }
        }

        // Validate billingStatus against OrderBillingStatus enum
        const finalBillingStatus: OrderBillingStatus = billingStatus || OrderBillingStatus.UNBILLED;
        if (!Object.values(OrderBillingStatus).includes(finalBillingStatus)) {
            return NextResponse.json(
                {
                    error: 'Invalid billing status',
                    message: `Le statut de facturation est invalide. Valeurs acceptées: ${Object.values(OrderBillingStatus).join(', ')}`,
                    field: 'billingStatus',
                    received: finalBillingStatus,
                },
                { status: 400 }
            );
        }
        if (finalBillingStatus === OrderBillingStatus.BILLED) {
            return NextResponse.json(
                {
                    error: 'Cannot set BILLED',
                    message: "Une demande ne peut pas être marquée « Facturé » manuellement : ce statut provient d'une facture.",
                    field: 'billingStatus',
                },
                { status: 400 }
            );
        }

        const createdDate: Date = new Date();
        const staffId = me.id;

        // A date de clôture only belongs on a demande « Terminé ». Nothing is
        // grandfathered on create — there is no history to protect.
        const resolvedClosureDate =
            resolveClosureDate({
                previousStatusId: null,
                nextStatusId: parsedStatusId,
                explicitClosureDate: parsedClosureDate,
            }) ?? null;
        const closureGuard = guardClosureDateRequiresTermine({
            statusId: parsedStatusId,
            closureDate: resolvedClosureDate,
            previousStatusId: null,
            previousClosureDate: null,
        });
        if (!closureGuard.ok) {
            return NextResponse.json(
                { error: 'Invalid closureDate', message: closureGuard.message, field: 'closureDate' },
                { status: closureGuard.httpStatus }
            );
        }

        const orderData = {
            aveugleId: parseInt(aveugleId),
            catalogueId: parseInt(catalogueId),
            requestReceivedDate: parsedRequestReceivedDate,
            statusId: parsedStatusId,
            isDuplication: isDuplication || false,
            mediaFormatId: parseInt(mediaFormatId),
            deliveryMethod: deliveryMethod as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE',
            processedByStaffId: staffId,
            createdDate,
            // A demande created straight into « Terminé » is closed today,
            // unless the admin supplied a date explicitly (guarded above).
            closureDate: resolvedClosureDate,
            updatedAt: new Date(),
            cost: parsedCost,
            billingStatus: finalBillingStatus,
            lentPhysicalBook: lentPhysicalBook || false,
            notes: notes || null,
        };

        const { order, autoBill } = await prisma.$transaction(async (tx) => {
            const created = await tx.orders.create({
                data: orderData,
                select: {
                    id: true,
                    aveugleId: true,
                    catalogueId: true,
                    requestReceivedDate: true,
                    statusId: true,
                    isDuplication: true,
                    mediaFormatId: true,
                    deliveryMethod: true,
                    processedByStaffId: true,
                    createdDate: true,
                    closureDate: true,
                    updatedAt: true,
                    cost: true,
                    billingStatus: true,
                    lentPhysicalBook: true,
                    notes: true,
                    aveugle: {
                        select: { name: true, email: true },
                    },
                    catalogue: {
                        select: { title: true, author: true },
                    },
                    status: {
                        select: { name: true },
                    },
                    mediaFormat: {
                        select: { name: true },
                    },
                },
            });

            await logOrderEvent(tx, {
                orderId: created.id,
                type: 'CREATED',
                toStatusId: created.statusId,
                performedById: staffId,
            });

            // Billing happens when the service is rendered, not on creation. After
            // guardOrderCompletion above, a demande born « Terminé » can only be a
            // duplication handled on the spot — its enregistrement already exists, so
            // its tarif is already known and accruing it now bills the right amount.
            let auto = null;
            if (parsedStatusId === STATUS.TERMINE) {
                await accrueOrderToOpenDraft(tx, created.id, staffId);
                auto = await issueDraftIfOverThreshold(tx, created.aveugleId, staffId);
            }
            return { order: created, autoBill: auto };
        });

        return NextResponse.json(
            { order, message: 'Demande créée avec succès', autoBill },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating order:', error);

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('Prisma error code:', error.code);

            if (error.code === 'P2003') {
                return NextResponse.json(
                    { error: 'Foreign key constraint failed', message: 'Une ou plusieurs références sont invalides.', details: error.meta, code: error.code },
                    { status: 400 }
                );
            }
            if (error.code === 'P2002') {
                return NextResponse.json(
                    { error: 'Unique constraint failed', message: 'Une demande avec ces informations existe déjà', details: error.meta, code: error.code },
                    { status: 400 }
                );
            }
            if (error.code === 'P2025') {
                return NextResponse.json(
                    { error: 'Record not found', message: 'Un enregistrement requis n\'a pas été trouvé', details: error.meta, code: error.code },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                { error: 'Database error', message: `Erreur de base de données: ${error.code}`, details: error.meta, code: error.code },
                { status: 400 }
            );
        }

        if (error instanceof Prisma.PrismaClientValidationError) {
            return NextResponse.json(
                { error: 'Validation error', message: 'Erreur de validation des données.', details: error.message },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: 'Failed to create order', message: 'Une erreur inattendue est survenue', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
});