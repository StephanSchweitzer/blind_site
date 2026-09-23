import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
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
    guardOrderStatus,
    guardOrderCompletion,
    guardManualEnCours,
    guardDuplicationFlip,
    guardDuplicationStatus,
    guardDemandeStatusSync,
    isOrderOnlyStatus,
    resolveClosureDate,
    guardClosureDateRequiresTermine,
    syncAssignmentToStatus,
    classifyStatusTransition,
    logOrderEvent,
} from '@/lib/statusSync';
import {
    recomputeBillTotal,
    accrueOrderToOpenDraft,
    issueDraftIfOverThreshold,
    logBillEvent,
    guardOrderClientOnBill,
    guardOrderUnbillableOnBill,
    guardOrderBillingStatusOnBill,
    guardOrderLeavingTermineOnBill,
    leavesTermine,
    detachOrderFromBill,
} from '@/lib/billing';
import { resolvePagePricing } from '@/lib/orders/pagePricing';
import { guardUserIsActive } from '@/lib/users/activityGuard';
import { withAdmin } from '@/lib/auth/guards';
import { DeletedBookError, guardLiveBooks, lockLiveBooks } from '@/lib/books/liveBookGuard';

// Reprint notice returned to the client when an invoice-relevant field changes on a
// non-DRAFT (issued) bill. COST = total recomputed; VISIBLE = printed field changed.
// ISSUED = completing this demande accrued it onto its client's brouillon and that
// crossed the seuil in the same request, so the facture is now émise for the first time.
// DETACHED is the only one that describes a DRAFT: the demande left « Terminé », so it
// left the brouillon it had joined by reaching it — nothing to reprint, but the
// permanent has to be told the line is gone from the total.
type BillNotice =
    | { billId: number; billState: BillingStatus; kind: 'COST'; newTotal: string | null }
    | { billId: number; billState: BillingStatus; kind: 'VISIBLE' }
    | { billId: number; billState: BillingStatus; kind: 'ISSUED'; total: string }
    // PROFORMA = the demande is priced by the page, so completing it created its own
    // pro-forma, issued on the spot (no brouillon, no seuil).
    | { billId: number; billState: BillingStatus; kind: 'PROFORMA'; total: string }
    | { billId: number; billState: BillingStatus; kind: 'DETACHED'; newTotal: string | null };

// Normalize a cost input to a number or null (treats '' / null / undefined / NaN as null).
function parseCost(raw: unknown): number | null {
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = parseFloat(String(raw));
    return Number.isNaN(n) ? null : n;
}

export const GET = withAdmin(async (request, { params }) => {
    try {
        const { id } = await params!;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json(
                { message: 'ID de demande invalide' },
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

        // Prisma rejects `select` and `include` as siblings. A relation nested INSIDE a
        // select carries its own select/include though, and every orderIncludeConfigs
        // entry is already shaped that way — so the relations are folded into the select
        // rather than passed alongside it. `mode: 'full'` leaves select null and keeps
        // passing include on its own.
        const hasIncludes = Object.keys(include).length > 0;
        const relationArgs: Prisma.OrdersFindUniqueArgs = select
            ? { where: { id: orderId }, select: { ...select, ...include } }
            : hasIncludes
                ? { where: { id: orderId }, include }
                : { where: { id: orderId } };

        const order = await prisma.orders.findUnique(relationArgs);

        if (!order) {
            return NextResponse.json(
                { message: 'Demande non trouvée' },
                { status: 404 }
            );
        }

        // findUnique n'est pas filtré par l'extension soft-delete (lib/prisma.ts) :
        // une demande supprimée reste donc joignable par id, volontairement — un
        // lien du journal ou une URL ouverte à la main doit continuer à mener
        // quelque part, comme GET /api/books/[id] et GET /api/user/[id]. C'est
        // au front d'afficher le bandeau « supprimée » (voir OrderDeletedNotice) :
        // deletedAt n'est retiré d'aucun select/include ci-dessus.
        return NextResponse.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de la demande' },
            { status: 500 }
        );
    }
});

export const PUT = withAdmin(async (request, { me, params }) => {
    revalidateAdmin();
    try {
        const performedById = me.id;

        const { id } = await params!;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json({ message: 'ID de demande invalide' }, { status: 400 });
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
                aveugleId: true,
                statusId: true,
                isDuplication: true,
                billId: true,
                cost: true,
                pages: true,
                billedPages: true,
                pricePerPage: true,
                transferFee: true,
                catalogueId: true,
                requestReceivedDate: true,
                closureDate: true,
                deletedAt: true,
                assignments: {
                    // Un include de relation n'est PAS filtré par l'extension
                    // soft-delete de lib/prisma.ts, et celui-ci ne sert pas à
                    // afficher : il pilote guardOrderCompletion, guardManualEnCours,
                    // guardDuplicationFlip et guardDemandeStatusSync. Une attribution
                    // supprimée y ferait passer la demande pour encore attribuée.
                    where: { deletedAt: null },
                    select: {
                        id: true,
                        statusId: true,
                        sentToReaderDate: true,
                        returnedToECADate: true,
                        _count: { select: { readerHistory: true } },
                    },
                    take: 1,
                },
                bill: { select: { id: true, state: true } },
            },
        });

        // Voir le GET : findUnique échappe au filtre soft-delete global.
        if (!existingOrder || existingOrder.deletedAt) {
            return NextResponse.json({ message: 'Demande non trouvée' }, { status: 404 });
        }

        const data = validation.data;
        const assignment = existingOrder.assignments[0] ?? null;
        // Joint aux refus causés par l'attribution, pour que le toast puisse y
        // mener (même clé que POST /api/assignments) : « gérez-le sur l'attribution »
        // sans dire laquelle laissait le permanent la chercher à la main.
        const blockingAssignment = assignment ? { blockingAssignmentId: assignment.id } : {};
        const billState = existingOrder.bill?.state ?? null;
        const hasBill = existingOrder.billId != null;

        // Changing the auditeur to someone inactive isn't allowed — only guard
        // when the field is actually changing, so routine edits of an order
        // that already belongs to a since-deactivated person aren't blocked.
        const clientIsChanging = data.aveugleId !== undefined && data.aveugleId !== existingOrder.aveugleId;
        if (clientIsChanging) {
            const activityGuard = await guardUserIsActive(data.aveugleId!, 'aveugle');
            if (!activityGuard.ok) {
                return NextResponse.json(
                    { message: activityGuard.message, blocked: activityGuard.blocked },
                    { status: activityGuard.httpStatus }
                );
            }
        }

        // L'auditeur décide de quelle facture la demande relève : addOrder refuse déjà
        // d'attacher une demande dont l'auditeur n'est pas le client de la facture, et
        // ceci ferme la porte de derrière — sans quoi une facture finissait par porter
        // le livre d'une personne au débit d'une autre. Verrouillé dès le brouillon.
        const clientOnBillGuard = guardOrderClientOnBill({
            changingClient: clientIsChanging,
            billId: existingOrder.billId,
            billState,
        });
        if (!clientOnBillGuard.ok) {
            return NextResponse.json({ message: clientOnBillGuard.message }, { status: clientOnBillGuard.httpStatus });
        }

        // « Facturé » is system-controlled via bills; reject setting it on an order with no bill.
        if (data.billingStatus === 'BILLED' && existingOrder.billId == null) {
            return NextResponse.json(
                { message: "Une demande ne peut pas être marquée « Facturé » manuellement : ce statut provient d'une facture." },
                { status: 400 }
            );
        }

        // …et « Non facturable » ne peut pas être posé sur une demande rattachée :
        // recomputeBillTotal somme par billId, pas par billingStatus, donc la ligne
        // continuerait d'être facturée tout en se déclarant hors du cycle.
        const unbillableGuard = guardOrderUnbillableOnBill({
            settingUnbillable: data.billingStatus === 'UNBILLABLE',
            billId: existingOrder.billId,
            billState,
        });
        if (!unbillableGuard.ok) {
            return NextResponse.json({ message: unbillableGuard.message }, { status: unbillableGuard.httpStatus });
        }

        // …et « Non facturé » ne peut pas davantage être posé sur une demande
        // rattachée à une facture émise : c'était la troisième valeur, la seule
        // encore acceptée telle quelle, et elle produisait l'inverse exact de
        // l'état « perdu » que removeOrder évite — la ligne restait comptée dans
        // le total tout en s'annonçant non facturée.
        const billingStatusGuard = guardOrderBillingStatusOnBill({
            billingStatus: data.billingStatus,
            billId: existingOrder.billId,
            billState,
        });
        if (!billingStatusGuard.ok) {
            return NextResponse.json({ message: billingStatusGuard.message }, { status: billingStatusGuard.httpStatus });
        }

        // « Soldé » is a facture status — a demande can never be set to it.
        if (data.statusId !== undefined) {
            const orderStatusGuard = guardOrderStatus(data.statusId);
            if (!orderStatusGuard.ok) {
                return NextResponse.json({ message: orderStatusGuard.message }, { status: orderStatusGuard.httpStatus });
            }
        }

        // « À faire » is duplication-only, and a duplication can hold nothing else
        // (bar « Terminé »). Guard the RESULTING combination — the statut and the
        // duplication flag can each change on their own.
        //
        // Only when one of them ACTUALLY changes: a legacy duplication that still
        // holds a recording statut stays editable (notes, coût…) instead of being
        // held hostage by its history. Any real change must still land on a valid pair.
        const statusIsChanging =
            data.statusId !== undefined && data.statusId !== existingOrder.statusId;
        const duplicationIsChanging =
            data.isDuplication !== undefined && data.isDuplication !== existingOrder.isDuplication;
        if (statusIsChanging || duplicationIsChanging) {
            const duplicationStatusGuard = guardDuplicationStatus(
                data.isDuplication ?? existingOrder.isDuplication,
                data.statusId ?? existingOrder.statusId
            );
            if (!duplicationStatusGuard.ok) {
                return NextResponse.json({ message: duplicationStatusGuard.message }, { status: duplicationStatusGuard.httpStatus });
            }
        }

        // A non-duplication order can't reach Attente envoi vers auditeur/Terminé/Soldé
        // without a finished assignment.
        //
        // Only when the statut or the duplication flag actually changes — the
        // same rule as guardDuplicationStatus above. The form sends statusId on
        // every save, so this used to run on a notes-only edit too, and a legacy
        // « Terminé » demande whose attribution was never closed in Access could
        // not be saved at all: held hostage by its history.
        if (statusIsChanging || duplicationIsChanging) {
            const completionGuard = guardOrderCompletion({
                statusId: data.statusId ?? existingOrder.statusId,
                isDuplication: data.isDuplication ?? existingOrder.isDuplication,
                assignmentStatusId: assignment?.statusId ?? null,
            });
            if (!completionGuard.ok) {
                return NextResponse.json({ message: completionGuard.message, ...blockingAssignment }, { status: completionGuard.httpStatus });
            }
        }

        // « En cours » is attribution-driven — it can't be typed onto a demande that
        // has no attribution at all. Only on an actual change, like the guards above.
        if (statusIsChanging) {
            const enCoursGuard = guardManualEnCours({
                statusId: data.statusId!,
                isDuplication: data.isDuplication ?? existingOrder.isDuplication,
                hasAssignment: assignment !== null,
            });
            if (!enCoursGuard.ok) {
                return NextResponse.json({ message: enCoursGuard.message }, { status: enCoursGuard.httpStatus });
            }
        }

        // Can't flip an order to a duplication once it has an assignment.
        if (data.isDuplication !== undefined) {
            const flipGuard = guardDuplicationFlip(data.isDuplication, assignment !== null);
            if (!flipGuard.ok) {
                return NextResponse.json({ message: flipGuard.message, ...blockingAssignment }, { status: flipGuard.httpStatus });
            }
        }

        // A demande status change may only reflect a status the attribution could legitimately
        // hold given its own owned fields (send/return dates). Block the side door that would
        // otherwise strand attribution-owned data (e.g. status→Attente while a date d'envoi is set).
        //
        // On a real change of the demande's statut only — like every guard above.
        // The form resends statusId on each save, and a legacy pair imported from
        // Access (demande « Terminé », attribution « En cours ») differs by
        // construction: this refused a notes-only edit outright.
        if (
            statusIsChanging &&
            assignment &&
            typeof data.statusId === 'number' &&
            !isOrderOnlyStatus(data.statusId) &&
            data.statusId !== assignment.statusId
        ) {
            const syncGuard = guardDemandeStatusSync({
                statusId: data.statusId,
                hasReader: assignment._count.readerHistory > 0,
                sentToReaderDate: assignment.sentToReaderDate,
                returnedToECADate: assignment.returnedToECADate,
            });
            if (!syncGuard.ok) {
                return NextResponse.json({ message: syncGuard.message, ...blockingAssignment }, { status: syncGuard.httpStatus });
            }
        }

        // ── Detect invoice-relevant changes ──────────────────────────────────────
        const oldCost = existingOrder.cost != null ? Number(existingOrder.cost) : null;

        // Demande tarifée à la page : le coût vient de ses pages, pas du formulaire.
        // Résolu AVANT costChanged, parce que c'est ce coût dérivé — et non un
        // `data.cost` éventuellement reçu — qui doit passer par le verrou PAID/SOLDE,
        // le recalcul du total et l'avis de réimpression plus bas.
        const pagePricing = resolvePagePricing({
            current: {
                pages: existingOrder.pages,
                billedPages: existingOrder.billedPages,
                pricePerPage: existingOrder.pricePerPage != null ? Number(existingOrder.pricePerPage) : null,
                transferFee: existingOrder.transferFee != null ? Number(existingOrder.transferFee) : null,
            },
            input: {
                pages: data.pages,
                billedPages: data.billedPages,
                pricePerPage: data.pricePerPage,
                transferFee: data.transferFee,
            },
            isDuplication: data.isDuplication ?? existingOrder.isDuplication,
            billId: existingOrder.billId,
        });
        if (!pagePricing.ok) {
            return NextResponse.json(
                { message: pagePricing.message, field: pagePricing.field },
                { status: pagePricing.httpStatus }
            );
        }

        const newCost = pagePricing.isPageBased ? pagePricing.cost : parseCost(data.cost);
        const costChanged = pagePricing.isPageBased
            ? newCost !== oldCost
            : data.cost !== undefined && newCost !== oldCost;

        const catalogueChanged = data.catalogueId !== undefined && data.catalogueId !== existingOrder.catalogueId;
        if (catalogueChanged) {
            const bookGuard = await guardLiveBooks([data.catalogueId!]);
            if (!bookGuard.ok) {
                return NextResponse.json({ message: bookGuard.message }, { status: bookGuard.httpStatus });
            }
        }
        const dupChanged = data.isDuplication !== undefined && data.isDuplication !== existingOrder.isDuplication;
        // La troisième — la date de clôture — se lit plus bas : elle est dérivée du
        // statut (resolveClosureDate) et pas seulement reçue, donc la comparaison
        // n'a de sens qu'une fois cette valeur résolue. Voir closureChanged.

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

        // ── Retour en arrière du statut sur une facture ──────────────────────────
        // Sortir de « Terminé » défait exactement ce que l'entrée en « Terminé » avait
        // fait. Sur un brouillon, la demande se détache donc toute seule (plus bas, dans
        // la transaction) — le miroir de l'accrual. Sur une facture émise, c'est refusé :
        // le document annonce une prestation rendue et il est déjà parti chez l'auditeur.
        const resultingStatusId = data.statusId ?? existingOrder.statusId;
        const rollbackGuard = guardOrderLeavingTermineOnBill({
            previousStatusId: existingOrder.statusId,
            nextStatusId: resultingStatusId,
            billId: existingOrder.billId,
            billState,
        });
        if (!rollbackGuard.ok) {
            return NextResponse.json({ message: rollbackGuard.message }, { status: rollbackGuard.httpStatus });
        }
        const detachFromDraft =
            existingOrder.billId != null &&
            billState === BillingStatus.DRAFT &&
            leavesTermine(existingOrder.statusId, resultingStatusId);

        // Date de clôture follows the status: stamped on entering « Terminé »,
        // cleared on leaving it. An explicit date from the form still wins.
        const closureDate = resolveClosureDate({
            previousStatusId: existingOrder.statusId,
            nextStatusId: data.statusId ?? existingOrder.statusId,
            explicitClosureDate:
                data.closureDate === undefined ? undefined : data.closureDate ? new Date(data.closureDate) : null,
        });

        // …and only « Terminé » may carry one. Legacy pairs round-tripped unchanged pass.
        const closureGuard = guardClosureDateRequiresTermine({
            statusId: data.statusId ?? existingOrder.statusId,
            closureDate,
            previousStatusId: existingOrder.statusId,
            previousClosureDate: existingOrder.closureDate,
        });
        if (!closureGuard.ok) {
            return NextResponse.json({ message: closureGuard.message }, { status: closureGuard.httpStatus });
        }

        // `undefined` = colonne laissée telle quelle, donc rien n'a bougé sur le
        // papier. Ce qui compte pour la réimpression, c'est la date de clôture :
        // c'est elle qui est imprimée dans la colonne « Livraison ».
        const closureChanged =
            closureDate !== undefined &&
            (closureDate?.getTime() ?? null) !== (existingOrder.closureDate?.getTime() ?? null);
        const visibleChanged = catalogueChanged || dupChanged || closureChanged || pagePricing.visibleChanged;

        // ── Printed-field lock: same boundary as the cost lock above ────────────
        // A facture payée or soldée is closed (.claude/rules/billing-pricing.md:
        // « do not mutate a locked bill's line items »), and 08-factures tells the
        // permanent it « ne peut plus être modifiée ». Only the cost was locked, so
        // the livre, the date de clôture (the « Livraison » column), the type
        // (duplication) and the pages of a line could still change under it, with
        // a mere reprint notice. On an ÉMISE facture that notice stays the
        // answer; on a closed one the way out is to reopen it.
        if (visibleChanged && hasBill && (billState === BillingStatus.PAID || billState === BillingStatus.SOLDE)) {
            return NextResponse.json(
                {
                    message: `Cette demande figure sur la facture #${existingOrder.billId}, ${
                        billState === BillingStatus.PAID ? 'payée' : 'soldée'
                    } : son livre, sa date de clôture, son type et ses pages ne se modifient plus. ` +
                        'Rouvrez la facture pour la rendre modifiable.',
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
            // `=== undefined` et non `|| null`, comme la ligne createdDate juste en
            // dessous : un champ absent doit laisser la colonne tranquille, pas y
            // écrire NULL. Ces deux-là s'écrivaient `data.x || null`, donc tout
            // appelant qui ne les renvoyait pas les effaçait — et processedByStaffId
            // est ce que lit l'index [processedByStaffId, createdDate] des
            // statistiques. Le formulaire les renvoie tous les deux, ce qui est
            // exactement pourquoi la perte ne se voyait pas.
            processedByStaffId:
                data.processedByStaffId === undefined ? undefined : (data.processedByStaffId || null),
            createdDate: data.createdDate === undefined ? undefined : (data.createdDate ? new Date(data.createdDate) : null),
            closureDate,
            cost: pagePricing.isPageBased || data.cost !== undefined ? newCost : undefined,
            ...(pagePricing.write ?? {}),
            billingStatus: data.billingStatus,
            // billId is intentionally NOT set here: an order's bill membership is managed
            // by the bill route (addOrder/removeOrder) and by accrual — never by an order edit.
            notes: data.notes === undefined ? undefined : (data.notes || null),
        };

        const { order, newTotal, issued, proforma } = await prisma.$transaction(async (tx) => {
            // Le refus de guardLiveBooks plus haut, relu sous verrou : voir lockLiveBooks.
            if (catalogueChanged) await lockLiveBooks(tx, [data.catalogueId!]);

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

            // Le livre de l'attribution suit celui de la demande. La colonne reste
            // portée par l'attribution — elle existe aussi sans demande (orderId
            // nullable), donc on ne peut pas la dériver — mais c'est ici, et nulle
            // part ailleurs, qu'on la réaligne : sans ça, guardAssignmentMatchesOrder
            // refusait ensuite TOUTE sauvegarde de l'attribution, notes comprises.
            // Pas de blocage si l'attribution est déjà chez un lecteur ou terminée :
            // le changement sert à corriger une erreur de saisie, et le formulaire
            // prévient avant que l'enregistrement fait porte sur l'ancien livre.
            if (catalogueChanged && assignment) {
                await tx.assignment.update({
                    where: { id: assignment.id },
                    data: { catalogueId: data.catalogueId },
                });
            }

            // Track the demande's processing history — creation is logged where the
            // order is created; this is every status transition after that, however
            // it was made (directly here, or pushed up from its attribution).
            if (statusIsChanging) {
                await logOrderEvent(tx, {
                    orderId,
                    type: classifyStatusTransition(existingOrder.statusId, data.statusId!),
                    fromStatusId: existingOrder.statusId,
                    toStatusId: data.statusId,
                    performedById,
                });
            }

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

            // Miroir de l'accrual : la demande quitte « Terminé », donc elle quitte le
            // brouillon qu'elle n'avait rejoint qu'en l'atteignant. Laisser la ligne sur
            // le brouillon la ferait facturer alors qu'elle est repartie en production.
            // Une facture émise ne passe jamais ici — guardOrderLeavingTermineOnBill l'a
            // déjà refusée plus haut.
            if (detachFromDraft && existingOrder.billId != null) {
                newTotal = await detachOrderFromBill(tx, {
                    orderId,
                    billId: existingOrder.billId,
                    reason: 'status-rollback',
                    performedById,
                });
            }

            // THE accrual point. A demande joins a brouillon when a permanent closes
            // it — having actually sent the audio to l'auditeur — never at creation,
            // mid-recording, or when its attribution came back.
            //
            // That late timing is what makes the tarif right. By here the chain
            // audio déposé → attribution « Terminé » (guardAssignmentHasAudio) →
            // demande « Terminé » (guardOrderCompletion) has already run, so the
            // livre has been weighed and repriceOpenOrdersForBook has already
            // realigned this demande's coût while it was still on no facture at all
            // (ADJUSTABLE_ORDER_WHERE matches billId: null). The amount attached
            // below is therefore the settled one — which matters because
            // issueDraftIfOverThreshold can turn the brouillon into a facture émise
            // in this same transaction, past the point where the reprice may still
            // touch it.
            //
            // On the TRANSITION into « Terminé » only, never on a demande already
            // sitting there. The earlier test read only the resulting status, so any
            // save of a « Terminé » demande with no facture — a note, a date — billed
            // it. And such demandes are there on purpose: « Retirer de la facture »
            // leaves one « Terminé » so it can go on another facture, and restoring a
            // demande whose facture was already émise/payée detaches it (POST
            // /api/orders/[id]/restore). The next harmless edit put the first back on
            // the newest brouillon and billed the second a second time. Billing one
            // of those is a permanent's decision: « Ajouter une demande » on a
            // brouillon, or POST /api/bills.
            const justCompletedAndUnbilled =
                existingOrder.billId == null &&
                existingOrder.statusId !== STATUS.TERMINE &&
                resultingStatusId === STATUS.TERMINE;
            // Une demande tarifée à la page ne rejoint pas un brouillon : accrueOrderToOpenDraft
            // lui crée sa pro-forma, émise d'emblée, et le dit par `proforma`. Elle n'est
            // donc soumise ni au seuil (branche suivante) ni au brouillon de l'auditeur.
            let proforma: { billId: number; total: number } | null = null;
            if (justCompletedAndUnbilled) {
                const accrued = await accrueOrderToOpenDraft(tx, orderId, performedById);
                if (accrued?.proformaTotal !== undefined) {
                    proforma = { billId: accrued.billId, total: accrued.proformaTotal };
                }
            }

            // A DRAFT may have crossed the seuil (new cost, or a freshly accrued order).
            // Skip issued bills (BILLED/PAID/SOLDE) — those go through the reprint path below.
            // Captured so the client can be told the facture just went out — see billNotice below.
            // Jamais après un détachement : le total vient de BAISSER, émettre la
            // facture à ce moment-là serait déclencher un envoi sur un retour en arrière.
            let issued: { billId: number; total: number } | null = null;
            if (!detachFromDraft && !proforma && (justCompletedAndUnbilled || billState === BillingStatus.DRAFT)) {
                issued = await issueDraftIfOverThreshold(tx, order.aveugleId, performedById);
            }

            // Propagate 1–3 down to the assignment; « Soldé » and « Attente envoi
            // vers auditeur » stay order-only (isOrderOnlyStatus) — they describe
            // what happens to the demande after the lecteur is out of the picture.
            //
            // Only when the demande's statut actually changed. Keyed on the two
            // statuses differing, this rewrote the ATTRIBUTION on any save of a
            // legacy pair — a notes edit could set it « Terminé » behind the
            // weighed-audio guard (guardAssignmentHasAudio), which only the
            // attribution's own route applies.
            if (
                statusIsChanging &&
                assignment &&
                typeof data.statusId === 'number' &&
                !isOrderOnlyStatus(data.statusId) &&
                data.statusId !== assignment.statusId
            ) {
                await syncAssignmentToStatus(tx, assignment.id, data.statusId, performedById);
            }

            return { order, newTotal, issued, proforma };
        });

        // Reprint notice for issued bills (never for DRAFT — nothing has been sent).
        let billNotice: BillNotice | null = null;
        if (detachFromDraft && existingOrder.billId != null) {
            billNotice = {
                billId: existingOrder.billId,
                billState: BillingStatus.DRAFT,
                kind: 'DETACHED',
                newTotal: newTotal?.toString() ?? null,
            };
        } else if (proforma) {
            billNotice = {
                billId: proforma.billId,
                billState: BillingStatus.BILLED,
                kind: 'PROFORMA',
                total: proforma.total.toString(),
            };
        } else if (issued) {
            // The bill this demande just accrued onto tipped over the seuil in this
            // same request — first time it's ever been émise, so print/send it.
            billNotice = { billId: issued.billId, billState: BillingStatus.BILLED, kind: 'ISSUED', total: issued.total.toString() };
        } else if (hasBill && existingOrder.billId != null && billState && billState !== BillingStatus.DRAFT) {
            if (costChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'COST', newTotal: newTotal?.toString() ?? null };
            } else if (visibleChanged) {
                billNotice = { billId: existingOrder.billId, billState, kind: 'VISIBLE' };
            }
        }

        return NextResponse.json({ message: 'Demande mise à jour avec succès', order, billNotice });
    } catch (error) {
        if (error instanceof DeletedBookError) {
            return NextResponse.json({ message: error.message }, { status: error.httpStatus });
        }
        console.error('Error updating order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la demande' },
            { status: 500 }
        );
    }
});

export const DELETE = withAdmin(async (_request, { me, params }) => {
    revalidateAdmin();
    try {
        const { id } = await params!;
        const orderId = parseInt(id);

        if (isNaN(orderId)) {
            return NextResponse.json({ message: 'ID de demande invalide' }, { status: 400 });
        }

        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                billId: true,
                deletedAt: true,
                bill: { select: { id: true, state: true } },
                // Filtré : une attribution déjà supprimée ne doit pas empêcher de
                // supprimer sa demande. Son numéro plutôt qu'un compte : le refus
                // ci-dessous renvoie vers elle.
                assignments: { where: { deletedAt: null }, select: { id: true }, take: 1 },
            },
        });

        if (!existingOrder || existingOrder.deletedAt) {
            return NextResponse.json({ message: 'Demande non trouvée' }, { status: 404 });
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

        if (existingOrder.assignments.length > 0) {
            return NextResponse.json(
                {
                    message: "Impossible de supprimer la demande car une attribution y est associée. Veuillez d'abord supprimer l'attribution.",
                    blockingAssignmentId: existingOrder.assignments[0].id,
                },
                { status: 400 }
            );
        }

        // SUPPRESSION LOGIQUE, pas physique.
        //
        // Orders porte isActive et deletedAt, et tous les chemins de lecture
        // filtrent déjà dessus : le modèle est fait pour ça, comme Bill et Payment.
        // Le `delete` physique emportait pourtant OrderEvent avec lui —
        // `onDelete: Cascade` — c'est-à-dire tout l'historique de traitement de la
        // demande. Cette table se décrit elle-même comme append-only et « its own
        // permanent history », volontairement exemptée de la purge de rétention des
        // AuditEvent parce qu'elle doit lui survivre ; et c'est elle que lit
        // « Demandes traitées » sur /admin/stats (lib/stats.ts). Chaque suppression
        // réécrivait donc en silence les mois passés.
        await prisma.$transaction(async (tx) => {
            await tx.orders.update({
                where: { id: orderId },
                data: { isActive: false, deletedAt: new Date() },
            });
            // Deleting a billed order changes its bill's total — keep it in sync.
            // recomputeBillTotal ne somme que les demandes isActive, donc la ligne
            // sort du total du seul fait d'être désactivée.
            //
            // …et l'historique de la facture le dit. Le total baissait sans aucun
            // événement en face : le journal d'un brouillon ne pouvait pas
            // expliquer son propre montant. billId, lui, reste posé — c'est ce qui
            // permet à la restauration de remettre la demande à sa place (POST
            // /api/orders/[id]/restore, qui écrit l'événement inverse).
            if (existingOrder.billId != null) {
                const newTotal = await recomputeBillTotal(tx, existingOrder.billId);
                await logBillEvent(tx, {
                    billId: existingOrder.billId,
                    type: 'ORDER_DETACHED',
                    payload: { orderId, reason: 'order-deleted', newTotal: newTotal.toString() },
                    performedById: me.id,
                });
            }
        });

        return NextResponse.json({
            message: 'Demande supprimée avec succès',
            deletedId: orderId,
        });
    } catch (error) {
        console.error('Error deleting order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de la demande' },
            { status: 500 }
        );
    }
});