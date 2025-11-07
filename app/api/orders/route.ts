import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {getServerSession} from "next-auth";
import {authOptions} from "@/lib/auth";

async function checkAdmin() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return {
            authorized: false,
            response: NextResponse.json(
                {
                    success: false,
                    message: 'Unauthorized'
                },
                {status: 401}
            )
        };
    }

    if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
        return {
            authorized: false,
            response: NextResponse.json(
                {
                    success: false,
                    message: 'Unauthorized'
                },
                {status: 403}
            )
        };
    }

    return {
        authorized: true,
        session
    };
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
        const billingStatus = searchParams.get('billingStatus');
        const isDuplication = searchParams.get('isDuplication');

        // DEBUG: Log what we received
        console.log('=== FILTER DEBUG ===');
        console.log('isDuplication param:', isDuplication);
        console.log('isDuplication type:', typeof isDuplication);
        console.log('isDuplication === "true":', isDuplication === 'true');
        console.log('isDuplication === "false":', isDuplication === 'false');

        const ordersPerPage = 10;

        const whereClause: Prisma.OrdersWhereInput = {};

        // Search filter
        if (search) {
            whereClause.OR = [
                {
                    aveugle: {
                        OR: [
                            {
                                name: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                            {
                                email: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                        ],
                    },
                },
                {
                    catalogue: {
                        OR: [
                            {
                                title: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
                            {
                                author: {
                                    contains: search,
                                    mode: Prisma.QueryMode.insensitive,
                                },
                            },
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

        // Billing status filter
        if (billingStatus && billingStatus !== 'all') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            whereClause.billingStatus = billingStatus as any;
        }

        // Duplication filter - FIXED VERSION
        if (isDuplication === 'true') {
            whereClause.isDuplication = true;
            console.log('Set isDuplication filter to TRUE');
        } else if (isDuplication === 'false') {
            whereClause.isDuplication = false;
            console.log('Set isDuplication filter to FALSE');
        }

        // DEBUG: Log the final where clause
        console.log('Final whereClause:', JSON.stringify(whereClause, null, 2));
        console.log('===================');

        const [orders, totalOrders] = await Promise.all([
            prisma.orders.findMany({
                where: whereClause,
                orderBy: { requestReceivedDate: 'desc' },
                skip: Math.max(0, (page - 1) * ordersPerPage),
                take: ordersPerPage,
                include: {
                    aveugle: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    catalogue: {
                        select: {
                            title: true,
                            author: true,
                        },
                    },
                    status: {
                        select: {
                            name: true,
                        },
                    },
                    mediaFormat: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            prisma.orders.count({ where: whereClause }),
        ]);

        // DEBUG: Log results
        console.log('Found orders:', orders.length);
        console.log('Total orders:', totalOrders);
        if (orders.length > 0) {
            console.log('Sample isDuplication values:', orders.slice(0, 3).map(o => ({
                id: o.id,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                isDuplication: (o as any).isDuplication
            })));
        }

        return NextResponse.json({
            orders,
            totalOrders,
            totalPages: Math.ceil(totalOrders / ordersPerPage),
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        return NextResponse.json({
            error: 'Failed to fetch orders',
            message: 'Erreur lors de la récupération des commandes'
        }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authCheck = await checkAdmin();
        if (!authCheck.authorized) {
            return authCheck.response;
        }

        // Now we have access to the authenticated session
        const session = authCheck.session;

        const body = await request.json();
        console.log('Received order data:', JSON.stringify(body, null, 2));

        const {
            aveugleId,
            catalogueId,
            requestReceivedDate,
            statusId,
            isDuplication,
            mediaFormatId,
            deliveryMethod,
            createdDate,
            closureDate,
            cost,
            billingStatus,
            lentPhysicalBook,
            notes,
        } = body;

        // Validation des champs requis
        if (!aveugleId) {
            console.error('Missing aveugleId');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'Le client est requis',
                    field: 'aveugleId'
                },
                { status: 400 }
            );
        }

        if (!catalogueId) {
            console.error('Missing catalogueId');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'Le livre est requis',
                    field: 'catalogueId'
                },
                { status: 400 }
            );
        }

        if (!statusId) {
            console.error('Missing statusId');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'Le statut est requis',
                    field: 'statusId'
                },
                { status: 400 }
            );
        }

        if (!requestReceivedDate) {
            console.error('Missing requestReceivedDate');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'La date de réception de la demande est requise',
                    field: 'requestReceivedDate'
                },
                { status: 400 }
            );
        }

        if (!mediaFormatId) {
            console.error('Missing mediaFormatId');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'Le format média est requis',
                    field: 'mediaFormatId'
                },
                { status: 400 }
            );
        }

        if (!deliveryMethod) {
            console.error('Missing deliveryMethod');
            return NextResponse.json(
                {
                    error: 'Missing required field',
                    message: 'La méthode de livraison est requise',
                    field: 'deliveryMethod'
                },
                { status: 400 }
            );
        }

        // Validation et parsing des dates
        let parsedRequestReceivedDate: Date;
        try {
            parsedRequestReceivedDate = new Date(requestReceivedDate);
            if (isNaN(parsedRequestReceivedDate.getTime())) {
                throw new Error('Invalid date');
            }
        } catch (dateError) {
            console.error('Invalid requestReceivedDate:', requestReceivedDate, dateError);
            return NextResponse.json(
                {
                    error: 'Invalid date format',
                    message: 'La date de réception de la demande est invalide',
                    field: 'requestReceivedDate',
                    received: requestReceivedDate
                },
                { status: 400 }
            );
        }

        let parsedCreatedDate: Date = new Date();
        if (createdDate) {
            try {
                parsedCreatedDate = new Date(createdDate);
                if (isNaN(parsedCreatedDate.getTime())) {
                    throw new Error('Invalid date');
                }
            } catch (dateError) {
                console.error('Invalid createdDate:', createdDate, dateError);
                return NextResponse.json(
                    {
                        error: 'Invalid date format',
                        message: 'La date de création est invalide',
                        field: 'createdDate',
                        received: createdDate
                    },
                    { status: 400 }
                );
            }
        }

        let parsedClosureDate: Date | null = null;
        if (closureDate) {
            try {
                parsedClosureDate = new Date(closureDate);
                if (isNaN(parsedClosureDate.getTime())) {
                    throw new Error('Invalid date');
                }
            } catch (dateError) {
                console.error('Invalid closureDate:', closureDate, dateError);
                return NextResponse.json(
                    {
                        error: 'Invalid date format',
                        message: 'La date de clôture est invalide',
                        field: 'closureDate',
                        received: closureDate
                    },
                    { status: 400 }
                );
            }
        }

        // Validation du coût
        let parsedCost: Prisma.Decimal | null = null;
        if (cost !== null && cost !== undefined && cost !== '') {
            try {
                parsedCost = new Prisma.Decimal(cost);
                if (parsedCost.isNaN()) {
                    throw new Error('Invalid cost');
                }
            } catch (costError) {
                console.error('Invalid cost:', cost, costError);
                return NextResponse.json(
                    {
                        error: 'Invalid cost format',
                        message: 'Le coût est invalide',
                        field: 'cost',
                        received: cost
                    },
                    { status: 400 }
                );
            }
        }

        // Validation du statut de facturation
        const validBillingStatuses = ['UNBILLED', 'BILLED', 'PAID'];
        const finalBillingStatus = billingStatus || 'UNBILLED';
        if (!validBillingStatuses.includes(finalBillingStatus)) {
            console.error('Invalid billingStatus:', finalBillingStatus);
            return NextResponse.json(
                {
                    error: 'Invalid billing status',
                    message: 'Le statut de facturation est invalide',
                    field: 'billingStatus',
                    received: finalBillingStatus
                },
                { status: 400 }
            );
        }

        // Préparation des données pour la création
        const orderData = {
            aveugleId: parseInt(aveugleId),
            catalogueId: parseInt(catalogueId),
            requestReceivedDate: parsedRequestReceivedDate,
            statusId: parseInt(statusId),
            isDuplication: isDuplication || false,
            mediaFormatId: parseInt(mediaFormatId),
            deliveryMethod: deliveryMethod as 'RETRAIT' | 'ENVOI' | 'NON_APPLICABLE',
            processedByStaffId: session?.user?.id ? parseInt(session.user.id) : null,
            createdDate: parsedCreatedDate,
            closureDate: parsedClosureDate,
            updatedAt: new Date(),
            cost: parsedCost,
            billingStatus: finalBillingStatus as 'UNBILLED' | 'BILLED' | 'PAID',
            lentPhysicalBook: lentPhysicalBook || false,
            notes: notes || null,
        };

        console.log('Creating order with data:', JSON.stringify(orderData, null, 2));

        // Création de la commande
        const order = await prisma.orders.create({
            data: orderData,
            include: {
                aveugle: {
                    select: {
                        name: true,
                        email: true,
                    },
                },
                catalogue: {
                    select: {
                        title: true,
                        author: true,
                    },
                },
                status: {
                    select: {
                        name: true,
                    },
                },
                mediaFormat: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        console.log('Order created successfully:', order.id);

        return NextResponse.json(
            {
                order,
                message: 'Commande créée avec succès'
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating order:', error);

        // Gestion des erreurs Prisma spécifiques
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.error('Prisma error code:', error.code);
            console.error('Prisma error meta:', error.meta);

            if (error.code === 'P2003') {
                return NextResponse.json(
                    {
                        error: 'Foreign key constraint failed',
                        message: 'Une ou plusieurs références sont invalides. Veuillez vérifier que tous les IDs existent.',
                        details: error.meta,
                        code: error.code
                    },
                    { status: 400 }
                );
            }

            if (error.code === 'P2002') {
                return NextResponse.json(
                    {
                        error: 'Unique constraint failed',
                        message: 'Une commande avec ces informations existe déjà',
                        details: error.meta,
                        code: error.code
                    },
                    { status: 400 }
                );
            }

            if (error.code === 'P2025') {
                return NextResponse.json(
                    {
                        error: 'Record not found',
                        message: 'Un enregistrement requis n\'a pas été trouvé',
                        details: error.meta,
                        code: error.code
                    },
                    { status: 404 }
                );
            }

            return NextResponse.json(
                {
                    error: 'Database error',
                    message: `Erreur de base de données: ${error.code}`,
                    details: error.meta,
                    code: error.code
                },
                { status: 400 }
            );
        }

        if (error instanceof Prisma.PrismaClientValidationError) {
            console.error('Prisma validation error:', error.message);
            return NextResponse.json(
                {
                    error: 'Validation error',
                    message: 'Erreur de validation des données. Veuillez vérifier tous les champs.',
                    details: error.message
                },
                { status: 400 }
            );
        }

        // Erreur générique
        return NextResponse.json(
            {
                error: 'Failed to create order',
                message: 'Une erreur inattendue est survenue lors de la création de la commande',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}