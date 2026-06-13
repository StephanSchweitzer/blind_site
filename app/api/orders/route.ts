import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma, OrderBillingStatus } from '@prisma/client';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

async function checkAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return {
            authorized: false,
            response: NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            )
        };
    }

    if (session.user.accessLevel !== 'admin' && session.user.accessLevel !== 'super_admin') {
        return {
            authorized: false,
            response: NextResponse.json(
                { success: false, message: 'Unauthorized' },
                { status: 403 }
            )
        };
    }

    return { authorized: true, session };
}

export async function GET(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const search = searchParams.get('search') || '';
        const filter = searchParams.get('filter') || 'all';
        const statusId = searchParams.get('statusId');
        const rawBillingStatus = searchParams.get('billingStatus');
        const isDuplication = searchParams.get('isDuplication');
        const retard = searchParams.get('retard');

        const ordersPerPage = 10;

        const whereClause: Prisma.OrdersWhereInput = {};

        // Search filter
        if (search) {
            whereClause.OR = [
                {
                    aveugle: {
                        OR: [
                            { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                            { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        ],
                    },
                },
                {
                    catalogue: {
                        OR: [
                            { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
                            { author: { contains: search, mode: Prisma.QueryMode.insensitive } },
                        ],
                    },
                },
            ];
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

        const [orders, totalOrders] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                orderBy: { requestReceivedDate: 'desc' },
                skip: Math.max(0, (page - 1) * ordersPerPage),
                take: ordersPerPage,
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
            }),
            prisma.orders.count({ where: whereClause }),
        ]);

        return NextResponse.json({
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch orders', message: 'Erreur lors de la récupération des commandes' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        const session = authCheck.session;
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

            // Validate + prepare each line (returns 400 on any bad line)
            const preparedLines: {
                catalogueId: number;
                statusId: number;
                mediaFormatId: number;
                isDuplication: boolean;
                lentPhysicalBook: boolean;
                cost: Prisma.Decimal | null;
            }[] = [];

            for (const b of books) {
                if (!b.catalogueId || !b.statusId || !b.mediaFormatId) {
                    return NextResponse.json(
                        { error: 'Missing fields in book line', message: 'Chaque ouvrage doit comporter un livre, un statut et un format média' },
                        { status: 400 }
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
                    statusId: parseInt(String(b.statusId)),
                    mediaFormatId: parseInt(String(b.mediaFormatId)),
                    isDuplication: !!b.isDuplication,
                    lentPhysicalBook: !!b.lentPhysicalBook,
                    cost: lineCost,
                });
            }

            const batchNow = new Date();
            const batchStaffId = session?.user?.id ? parseInt(session.user.id) : null;
            const batchAveugleId = parseInt(String(aveugleId));

            const created = await prisma.$transaction(
                preparedLines.map((l) =>
                    prisma.orders.create({
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
                            cost: l.cost,
                            billingStatus: batchBillingStatus,
                            lentPhysicalBook: l.lentPhysicalBook,
                            notes: notes || null,
                        },
                        select: { id: true },
                    })
                )
            );

            return NextResponse.json(
                { orderIds: created.map((o) => o.id), message: `${created.length} commande(s) créée(s) avec succès` },
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

        const createdDate: Date = new Date();

        const orderData = {
            aveugleId: parseInt(aveugleId),
            catalogueId: parseInt(catalogueId),
            requestReceivedDate: parsedRequestReceivedDate,
            statusId: parseInt(statusId),
            isDuplication: isDuplication || false,
            mediaFormatId: parseInt(mediaFormatId),
            deliveryMethod: deliveryMethod as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE',
            processedByStaffId: session?.user?.id ? parseInt(session.user.id) : null,
            createdDate,
            closureDate: parsedClosureDate,
            updatedAt: new Date(),
            cost: parsedCost,
            billingStatus: finalBillingStatus,
            lentPhysicalBook: lentPhysicalBook || false,
            notes: notes || null,
        };

        const order = await prisma.orders.create({
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

        return NextResponse.json(
            { order, message: 'Commande créée avec succès' },
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
                    { error: 'Unique constraint failed', message: 'Une commande avec ces informations existe déjà', details: error.meta, code: error.code },
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
}