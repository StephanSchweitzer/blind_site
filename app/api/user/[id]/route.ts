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
} from '@/types';
import { UserWithRelationCounts } from '@/types/models/user.model';
import { AddressCreateInput } from '@/types/api/common.api';
import { Prisma } from '@prisma/client';

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

        const modeValidation = UserQueryModeSchema.safeParse(modeParam);
        if (!modeValidation.success) {
            return NextResponse.json(
                { message: 'Mode invalide. Utilisez: basic, profile, ou full' },
                { status: 400 }
            );
        }
        const mode = modeValidation.data;

        const includeRelations = includeParam
            ? includeParam.split(',').filter(Boolean).map(r => r.trim())
            : [];

        let select: Prisma.UserSelect | undefined;
        const include: UserIncludeConfig = {};

        switch (mode) {
            case 'basic':
                select = basicUserSelect;
                break;

            case 'profile':
                select = profileUserSelect;
                break;

            case 'full':
                select = fullUserSelect;
                break;
        }

        let hasIncludes = false;
        if (mode === 'full' && includeRelations.length > 0) {
            for (const relation of includeRelations) {
                const relationValidation = UserIncludeRelationSchema.safeParse(relation);
                if (!relationValidation.success) {
                    continue;
                }

                hasIncludes = true;

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

                    case 'assignmentReaders':
                        include.assignmentReaders = userIncludeConfigs.assignmentReaders;
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

        let user;

        if (hasIncludes) {
            const userWithPassword = await prisma.user.findUnique({
                where: { id: userId },
                include,
            });

            if (userWithPassword) {
                const { password: _password, passwordNeedsChange: _passwordNeedsChange, ...userWithoutPassword } = userWithPassword;
                user = userWithoutPassword;
            }
        } else {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select,
            });
        }

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

interface UserUpdateRequestBody extends UserUpdateInput {
    addresses?: Omit<AddressCreateInput, 'userId'>[];
}

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

        const body = await request.json() as UserUpdateRequestBody;

        if ((body as Record<string, unknown>).password || (body as Record<string, unknown>).passwordNeedsChange) {
            return NextResponse.json(
                { message: 'Les mots de passe ne peuvent pas être modifiés via cet endpoint' },
                { status: 400 }
            );
        }

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

        // Handle addresses separately
        if (body.addresses !== undefined) {
            await prisma.address.deleteMany({
                where: { userId: userId }
            });

            if (body.addresses.length > 0) {
                type UpdateDataWithAddresses = UserUpdateData & {
                    addresses?: {
                        create: Array<{
                            addressLine1: string | null;
                            addressSupplement: string | null;
                            city: string | null;
                            postalCode: string | null;
                            stateProvince: string | null;
                            country: string;
                            isDefault: boolean;
                        }>;
                    };
                };

                (updateData as UpdateDataWithAddresses).addresses = {
                    create: body.addresses.map((addr) => ({
                        addressLine1: addr.addressLine1 || null,
                        addressSupplement: addr.addressSupplement || null,
                        city: addr.city || null,
                        postalCode: addr.postalCode || null,
                        stateProvince: addr.stateProvince || null,
                        country: addr.country || 'France',
                        isDefault: addr.isDefault || false,
                    }))
                };
            }
        }

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
                        assignmentReaders: true,
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

        const hasActiveRelations =
            existingUser._count.ordersAsAveugle > 0 ||
            existingUser._count.ordersProcessedBy > 0 ||
            existingUser._count.assignmentReaders > 0 ||
            existingUser._count.assignmentsProcessedBy > 0;

        if (hasActiveRelations) {
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