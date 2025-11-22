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
    OrderUpdateData,
    OrderCreateInput,
    OrderCreateInputSchema,
    OrderCreateData,
} from '@/types';
import { Prisma } from '@prisma/client';


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

        // Validate mode
        const modeValidation = OrderQueryModeSchema.safeParse(modeParam);
        if (!modeValidation.success) {
            return NextResponse.json(
                { message: 'Mode invalide. Utilisez: basic, detailed, ou full' },
                { status: 400 }
            );
        }
        const mode = modeValidation.data;

        // Parse include relations
        const includeRelations = includeParam
            ? includeParam.split(',').filter(Boolean).map(r => r.trim())
            : [];

        // Define field selections based on mode
        let select: Prisma.OrdersSelect | null = null;
        const include: OrderIncludeConfig = {};

        switch (mode) {
            case 'basic':
                select = basicOrderSelect;
                break;

            case 'detailed':
                select = detailedOrderSelect;
                // Add default relations for detailed mode
                include.aveugle = orderIncludeConfigs.aveugle;
                include.catalogue = orderIncludeConfigs.catalogue;
                include.status = orderIncludeConfigs.status;
                include.mediaFormat = orderIncludeConfigs.mediaFormat;
                include.processedByStaff = orderIncludeConfigs.processedByStaff;
                break;

            case 'full':
                select = null; // Get all fields
                break;
        }

        // Build include object for relations
        if (includeRelations.length > 0) {
            for (const relation of includeRelations) {
                const relationValidation = OrderIncludeRelationSchema.safeParse(relation);
                if (!relationValidation.success) {
                    continue;
                }

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

        // Fetch the order
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

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
    try {
        const body: OrderCreateInput = await request.json();

        // Validate input
        const validation = OrderCreateInputSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                {
                    message: 'Données invalides',
                    errors: validation.error.issues,
                },
                { status: 400 }
            );
        }

        const data = validation.data;

        // Build create data
        const createData: OrderCreateData = {
            aveugleId: data.aveugleId,
            catalogueId: data.catalogueId,
            requestReceivedDate: new Date(data.requestReceivedDate),
            statusId: data.statusId,
            isDuplication: data.isDuplication,
            mediaFormatId: data.mediaFormatId,
            deliveryMethod: data.deliveryMethod,
            lentPhysicalBook: data.lentPhysicalBook,
            processedByStaffId: data.processedByStaffId || null,
            createdDate: data.createdDate ? new Date(data.createdDate) : null,
            closureDate: data.closureDate ? new Date(data.closureDate) : null,
            cost: data.cost ? parseFloat(String(data.cost)) : null,
            billingStatus: data.billingStatus,
            billId: data.billId || null,
            notes: data.notes || null,
        };

        // Create the order
        const newOrder = await prisma.orders.create({
            data: createData,
            include: {
                aveugle: orderIncludeConfigs.aveugle,
                catalogue: orderIncludeConfigs.catalogue,
                status: orderIncludeConfigs.status,
                mediaFormat: orderIncludeConfigs.mediaFormat,
                processedByStaff: orderIncludeConfigs.processedByStaff,
            },
        });

        return NextResponse.json(
            {
                message: 'Commande créée avec succès',
                order: newOrder,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la création de la commande' },
            { status: 500 }
        );
    }
}

// PUT /api/orders/[id] - Full update of an order
export async function PUT(
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

        const body: OrderUpdateInput = await request.json();

        // Validate input
        const validation = OrderUpdateInputSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                {
                    message: 'Données invalides',
                    errors: validation.error.issues,
                },
                { status: 400 }
            );
        }

        // Check if order exists
        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: { id: true },
        });

        if (!existingOrder) {
            return NextResponse.json(
                { message: 'Commande non trouvée' },
                { status: 404 }
            );
        }

        const data = validation.data;

        // Build update data - PUT requires all fields
        const updateData: OrderUpdateData = {
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
            cost: data.cost ? parseFloat(String(data.cost)) : null,
            billingStatus: data.billingStatus,
            billId: data.billId || null,
            notes: data.notes || null,
        };

        // Update the order
        const updatedOrder = await prisma.orders.update({
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

        return NextResponse.json({
            message: 'Commande mise à jour avec succès',
            order: updatedOrder,
        });
    } catch (error) {
        console.error('Error updating order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la commande' },
            { status: 500 }
        );
    }
}

// PATCH /api/orders/[id] - Partial update of an order
export async function PATCH(
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

        const body: OrderUpdateInput = await request.json();

        // Check if order exists
        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: { id: true },
        });

        if (!existingOrder) {
            return NextResponse.json(
                { message: 'Commande non trouvée' },
                { status: 404 }
            );
        }

        // Build update data - only include provided fields
        const updateData: OrderUpdateData = {};

        if (body.aveugleId !== undefined) updateData.aveugleId = body.aveugleId;
        if (body.catalogueId !== undefined) updateData.catalogueId = body.catalogueId;
        if (body.requestReceivedDate !== undefined) {
            updateData.requestReceivedDate = new Date(body.requestReceivedDate);
        }
        if (body.statusId !== undefined) updateData.statusId = body.statusId;
        if (body.isDuplication !== undefined) updateData.isDuplication = body.isDuplication;
        if (body.mediaFormatId !== undefined) updateData.mediaFormatId = body.mediaFormatId;
        if (body.deliveryMethod !== undefined) updateData.deliveryMethod = body.deliveryMethod;
        if (body.processedByStaffId !== undefined) {
            updateData.processedByStaffId = body.processedByStaffId || null;
        }
        if (body.createdDate !== undefined) {
            updateData.createdDate = body.createdDate ? new Date(body.createdDate) : null;
        }
        if (body.closureDate !== undefined) {
            updateData.closureDate = body.closureDate ? new Date(body.closureDate) : null;
        }
        if (body.cost !== undefined) {
            updateData.cost = body.cost ? parseFloat(String(body.cost)) : null;
        }
        if (body.billingStatus !== undefined) updateData.billingStatus = body.billingStatus;
        if (body.billId !== undefined) updateData.billId = body.billId || null;
        if (body.lentPhysicalBook !== undefined) updateData.lentPhysicalBook = body.lentPhysicalBook;
        if (body.notes !== undefined) updateData.notes = body.notes || null;

        // Update the order
        const updatedOrder = await prisma.orders.update({
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

        return NextResponse.json({
            message: 'Commande mise à jour avec succès',
            order: updatedOrder,
        });
    } catch (error) {
        console.error('Error patching order:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la commande' },
            { status: 500 }
        );
    }
}

// DELETE /api/orders/[id] - Delete an order
export async function DELETE(
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

        // Check if order exists and has assignments
        const existingOrder = await prisma.orders.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                _count: {
                    select: {
                        assignments: true,
                    },
                },
            },
        });

        if (!existingOrder) {
            return NextResponse.json(
                { message: 'Commande non trouvée' },
                { status: 404 }
            );
        }

        // Check if order has related assignments
        if (existingOrder._count.assignments > 0) {
            return NextResponse.json(
                {
                    message: 'Impossible de supprimer la commande car elle a des affectations associées. Veuillez d\'abord supprimer les affectations.',
                    hasAssignments: true,
                    assignmentCount: existingOrder._count.assignments,
                },
                { status: 400 }
            );
        }

        // Delete the order
        await prisma.orders.delete({
            where: { id: orderId },
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