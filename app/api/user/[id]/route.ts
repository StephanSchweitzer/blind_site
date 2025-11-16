import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    UserQueryModeSchema,
    UserIncludeRelationSchema,
    UserIncludeConfig,
    basicUserSelect,
    profileUserSelect,
    fullUserSelect,
    userIncludeConfigs,
    UserUpdateInput,
    UserUpdateData,
    UserDeleteResponse,
    UserWithRelationCounts,
} from '@/types/api/user.types';
import { Prisma } from '@prisma/client';

/**
 * GET /api/user/[id] - Get a single user by ID
 *
 * SECURITY: Password fields are NEVER returned in any mode.
 * Password updates must use a dedicated authentication endpoint.
 *
 * Query Parameters:
 * - mode: 'basic' | 'profile' | 'full' (default: 'basic')
 * - include: Comma-separated relations to include (e.g., 'addresses,bills')
 *
 * Modes:
 * - basic: id, name, email (for dropdowns/searches)
 * - profile: All profile fields but no relations
 * - full: All fields (except password) and specified relations
 *
 * Examples:
 * - /api/user/1 - Basic info
 * - /api/user/1?mode=profile - Full profile
 * - /api/user/1?mode=full&include=addresses,ordersAsAveugle - Full with relations
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID utilisateur invalide' },
                { status: 400 }
            );
        }

        const { searchParams } = new URL(request.url);
        const modeParam = searchParams.get('mode') || 'basic';
        const includeParam = searchParams.get('include');

        // Validate mode
        const modeValidation = UserQueryModeSchema.safeParse(modeParam);
        if (!modeValidation.success) {
            return NextResponse.json(
                { message: 'Mode invalide. Utilisez: basic, profile, ou full' },
                { status: 400 }
            );
        }
        const mode = modeValidation.data;

        // Parse include relations
        const includeRelations = includeParam
            ? includeParam.split(',').filter(Boolean).map(r => r.trim())
            : [];

        // Define field selections based on mode
        // SECURITY: Password field is NEVER included in any mode
        let select: Prisma.UserSelect;
        const include: UserIncludeConfig = {};

        switch (mode) {
            case 'basic':
                // Minimal info for dropdowns and searches
                select = basicUserSelect;
                break;

            case 'profile':
                // Full profile without relations
                select = profileUserSelect;
                break;

            case 'full':
                // All fields EXCEPT password (explicitly excluded for security)
                select = fullUserSelect;
                break;
        }

        // Build include object for relations
        if (mode === 'full' && includeRelations.length > 0) {
            for (const relation of includeRelations) {
                const relationValidation = UserIncludeRelationSchema.safeParse(relation);
                if (!relationValidation.success) {
                    continue; // Silently ignore unknown relations
                }

                switch (relationValidation.data) {
                    case 'addresses':
                        include.addresses = userIncludeConfigs.addresses;
                        break;

                    case 'ordersAsAveugle':
                        include.ordersAsAveugle = userIncludeConfigs.ordersAsAveugle;
                        break;

                    case 'ordersProcessedBy':
                        include.ordersProcessedBy = userIncludeConfigs.ordersProcessedBy;
                        break;

                    case 'assignmentsAsReader':
                        include.assignmentsAsReader = userIncludeConfigs.assignmentsAsReader;
                        break;

                    case 'assignmentsProcessedBy':
                        include.assignmentsProcessedBy = userIncludeConfigs.assignmentsProcessedBy;
                        break;

                    case 'bills':
                        include.bills = userIncludeConfigs.bills;
                        break;

                    case 'books':
                        include.books = userIncludeConfigs.books;
                        break;

                    case 'coupsDeCoeur':
                        include.CoupsDeCoeur = userIncludeConfigs.coupsDeCoeur;
                        break;

                    case 'news':
                        include.News = userIncludeConfigs.news;
                        break;

                    case 'summary':
                        include.addresses = userIncludeConfigs.addresses;
                        include._count = userIncludeConfigs.summary._count;
                        break;
                }
            }
        }

        // Fetch the user - password is NEVER retrieved
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select,
            ...(Object.keys(include).length > 0 && { include }),
        });

        if (!user) {
            return NextResponse.json(
                { message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        return NextResponse.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de l\'utilisateur' },
            { status: 500 }
        );
    }
}

// PATCH /api/user/[id] - Partial update of user
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID utilisateur invalide' },
                { status: 400 }
            );
        }

        const body: UserUpdateInput = await request.json();

        // SECURITY: Reject password update attempts explicitly
        if ('password' in body) {
            return NextResponse.json(
                { message: 'Les mises à jour de mot de passe doivent utiliser l\'endpoint dédié' },
                { status: 400 }
            );
        }

        // Check if user exists (without retrieving password)
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!existingUser) {
            return NextResponse.json(
                { message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Build update data with proper types
        const updateData: UserUpdateData = {};

        // Profile fields
        if (body.name !== undefined) updateData.name = body.name;
        if (body.firstName !== undefined) updateData.firstName = body.firstName || null;
        if (body.lastName !== undefined) updateData.lastName = body.lastName || null;
        if (body.email !== undefined) updateData.email = body.email || null;
        if (body.role !== undefined) updateData.role = body.role;
        if (body.homePhone !== undefined) updateData.homePhone = body.homePhone || null;
        if (body.cellPhone !== undefined) updateData.cellPhone = body.cellPhone || null;
        if (body.gestconteNotes !== undefined) updateData.gestconteNotes = body.gestconteNotes || null;
        if (body.gestconteId !== undefined) updateData.gestconteId = body.gestconteId || null;
        if (body.nonProfitAffiliation !== undefined) updateData.nonProfitAffiliation = body.nonProfitAffiliation || null;

        // Status fields
        if (body.isActive !== undefined) updateData.isActive = body.isActive;
        if (body.terminationDate !== undefined) {
            updateData.terminationDate = body.terminationDate ? new Date(body.terminationDate) : null;
        }
        if (body.terminationReason !== undefined) updateData.terminationReason = body.terminationReason || null;

        // Delivery and payment preferences
        if (body.preferredDeliveryMethod !== undefined) updateData.preferredDeliveryMethod = body.preferredDeliveryMethod || null;
        if (body.preferredDistributionMethod !== undefined) updateData.preferredDistributionMethod = body.preferredDistributionMethod || null;
        if (body.paymentThreshold !== undefined) {
            updateData.paymentThreshold = body.paymentThreshold ? parseFloat(String(body.paymentThreshold)) : null;
        }
        if (body.currentBalance !== undefined) {
            updateData.currentBalance = body.currentBalance ? parseFloat(String(body.currentBalance)) : null;
        }

        // Reader/staff fields
        if (body.isAvailable !== undefined) updateData.isAvailable = body.isAvailable;
        if (body.availabilityNotes !== undefined) updateData.availabilityNotes = body.availabilityNotes || null;
        if (body.specialization !== undefined) updateData.specialization = body.specialization || null;
        if (body.maxConcurrentAssignments !== undefined) updateData.maxConcurrentAssignments = body.maxConcurrentAssignments || null;

        // Notes
        if (body.notes !== undefined) updateData.notes = body.notes || null;

        // Update the user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                lastUpdated: true,
            },
        });

        return NextResponse.json({
            message: 'Utilisateur mis à jour avec succès',
            user: updatedUser,
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de l\'utilisateur' },
            { status: 500 }
        );
    }
}

// DELETE /api/user/[id] - Soft delete (deactivate) a user
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID utilisateur invalide' },
                { status: 400 }
            );
        }

        // Check if user exists and has relationships (password never retrieved)
        const existingUser: UserWithRelationCounts | null = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                _count: {
                    select: {
                        ordersAsAveugle: true,
                        ordersProcessedBy: true,
                        assignmentsAsReader: true,
                        assignmentsProcessedBy: true,
                    },
                },
            },
        });

        if (!existingUser) {
            return NextResponse.json(
                { message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        // Check for active relationships
        const hasActiveRelations =
            existingUser._count.ordersAsAveugle > 0 ||
            existingUser._count.ordersProcessedBy > 0 ||
            existingUser._count.assignmentsAsReader > 0 ||
            existingUser._count.assignmentsProcessedBy > 0;

        if (hasActiveRelations) {
            // Soft delete - deactivate the user instead of deleting
            const deactivatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    isActive: false,
                    terminationDate: new Date(),
                    terminationReason: 'Désactivé via l\'interface',
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    isActive: true,
                },
            });

            const response: UserDeleteResponse = {
                message: 'Utilisateur désactivé avec succès (a des relations existantes)',
                user: deactivatedUser,
                softDelete: true,
            };

            return NextResponse.json(response);
        }

        // Hard delete if no relations
        await prisma.user.delete({
            where: { id: userId },
        });

        const response: UserDeleteResponse = {
            message: 'Utilisateur supprimé définitivement avec succès',
            deletedId: userId,
            softDelete: false,
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de l\'utilisateur' },
            { status: 500 }
        );
    }
}