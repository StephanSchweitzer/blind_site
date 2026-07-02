import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { isSendableEmail } from '@/lib/email/sendEmail';
import { sendInvitationEmail } from '@/lib/email/sendInvitationEmail';
import { getCurrentUser, isAdmin } from '@/lib/auth/guards';
import { getUserDeletionBlockers, describeBlockers } from '@/lib/users/deletionGuard';
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
} from '@/types';
import { AddressCreateInput } from '@/types/api/common.api';
import { Prisma, MemberType, AccessLevel, DeliveryMethod } from '@prisma/client';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID de personne invalide' },
                { status: 400 }
            );
        }

        // Auth: must be signed in. Authorize: admins see anyone; a non-admin may
        // read only their OWN record, and only basic fields.
        const me = await getCurrentUser();
        if (!me) {
            return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        }
        const admin = isAdmin(me.accessLevel);
        if (!admin && me.id !== userId) {
            return NextResponse.json({ message: 'Accès refusé' }, { status: 403 });
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
        // Non-admins are capped at basic regardless of what they request, and never
        // get relation includes.
        const mode = admin ? modeValidation.data : 'basic';

        const includeRelations = admin && includeParam
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
                { message: 'Personne non trouvée' },
                { status: 404 }
            );
        }

        return NextResponse.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la récupération de la personne' },
            { status: 500 }
        );
    }
}

interface UserUpdateRequestBody extends UserUpdateInput {
    addresses?: Omit<AddressCreateInput, 'userId'>[];
    memberType?: MemberType;
    accessLevel?: AccessLevel;
    civilityId?: number | null;
    civilityOther?: string | null;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    revalidateAdmin();
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID de personne invalide' },
                { status: 400 }
            );
        }

        // Auth: signed in + admin/super_admin to edit users.
        const me = await getCurrentUser();
        if (!me) {
            return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        }
        if (!isAdmin(me.accessLevel)) {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }
        const actorLevel = me.accessLevel;

        const body = await request.json() as UserUpdateRequestBody;

        // Clients still can't set passwords directly; provisioning below is server-side only.
        if ((body as Record<string, unknown>).password || (body as Record<string, unknown>).passwordNeedsChange) {
            return NextResponse.json(
                { message: 'Les mots de passe ne peuvent pas être modifiés via cet endpoint' },
                { status: 400 }
            );
        }

        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                memberType: true,
                accessLevel: true,
                password: true,
            },
        });

        if (!existingUser) {
            return NextResponse.json(
                { message: 'Personne non trouvée' },
                { status: 404 }
            );
        }

        // Resulting access level after this update, and whether it's a login account.
        const resultingAccessLevel = body.accessLevel ?? existingUser.accessLevel;
        const resultingIsLogin =
            resultingAccessLevel === 'admin' || resultingAccessLevel === 'super_admin';

        // Elevating someone TO a login level is privileged — super_admin only,
        // mirroring the create route. Scoped to actual changes so a plain admin can
        // still edit existing admins without being blocked.
        const isElevation =
            body.accessLevel !== undefined &&
            body.accessLevel !== existingUser.accessLevel &&
            (body.accessLevel === 'admin' || body.accessLevel === 'super_admin');
        if (isElevation && actorLevel !== 'super_admin') {
            return NextResponse.json(
                { message: 'Seuls les super administrateurs peuvent promouvoir une personne en administrateur ou membre permanent' },
                { status: 403 }
            );
        }

        const updateData: UserUpdateData & {
            memberType?: MemberType;
            accessLevel?: AccessLevel;
            civilityId?: number | null;
            civilityOther?: string | null;
            password?: string;
            passwordNeedsChange?: boolean;
        } = {};

        // Normalize email like the other routes; track the resulting address for
        // duplicate checking and (if needed) credential delivery.
        let resultingEmail = existingUser.email;
        if (body.email !== undefined) {
            const normalized = body.email ? body.email.trim().toLowerCase() : null;
            updateData.email = normalized;
            resultingEmail = normalized;

            if (normalized) {
                const clash = await prisma.user.findFirst({
                    where: {
                        email: { equals: normalized, mode: 'insensitive' },
                        id: { not: userId },
                    },
                    select: { id: true },
                });
                if (clash) {
                    return NextResponse.json({ message: 'Cet email est déjà utilisé' }, { status: 400 });
                }
            }
        }

        // Profile fields
        if (body.name !== undefined) updateData.name = body.name;
        if (body.firstName !== undefined) updateData.firstName = body.firstName || null;
        if (body.lastName !== undefined) updateData.lastName = body.lastName || null;
        if (body.role !== undefined) updateData.role = body.role; // legacy
        if (body.memberType !== undefined) updateData.memberType = body.memberType;
        if (body.accessLevel !== undefined) updateData.accessLevel = body.accessLevel;
        if (body.homePhone !== undefined) updateData.homePhone = body.homePhone || null;
        if (body.cellPhone !== undefined) updateData.cellPhone = body.cellPhone || null;
        if (body.gestconteNotes !== undefined) updateData.gestconteNotes = body.gestconteNotes || null;
        if (body.gestconteId !== undefined) updateData.gestconteId = body.gestconteId || null;
        if (body.nonProfitAffiliation !== undefined) updateData.nonProfitAffiliation = body.nonProfitAffiliation || null;

        // Civility
        if (body.civilityId !== undefined) updateData.civilityId = body.civilityId ?? null;
        if (body.civilityOther !== undefined) updateData.civilityOther = body.civilityOther || null;

        // Status fields
        if (body.isActive !== undefined) updateData.isActive = body.isActive;
        if (body.terminationDate !== undefined) {
            updateData.terminationDate = body.terminationDate ? new Date(body.terminationDate) : null;
        }
        if (body.terminationReason !== undefined) updateData.terminationReason = body.terminationReason || null;

        // Delivery and payment preferences
        if (body.preferredDeliveryMethod !== undefined) {
            const dm = body.preferredDeliveryMethod;
            if (dm && !Object.values(DeliveryMethod).includes(dm as DeliveryMethod)) {
                return NextResponse.json(
                    { message: 'Méthode de livraison invalide' },
                    { status: 400 }
                );
            }
            updateData.preferredDeliveryMethod = (dm as DeliveryMethod) || null;
        }
        if (body.preferredMediaFormatId !== undefined) updateData.preferredMediaFormatId = body.preferredMediaFormatId ?? null;
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
        if (body.saveType !== undefined) updateData.saveType = body.saveType || null;
        if (body.maxConcurrentAssignments !== undefined) updateData.maxConcurrentAssignments = body.maxConcurrentAssignments || null;

        // Notes
        if (body.notes !== undefined) updateData.notes = body.notes || null;

        // Provision credentials when the result is a login account that has none yet
        // (e.g. a member promoted to admin). Existing admins keep their password — we
        // never regenerate/resend on a routine edit.
        const needsProvisioning = resultingIsLogin && !existingUser.password;
        let temporaryPassword: string | null = null;
        if (needsProvisioning) {
            if (!isSendableEmail(resultingEmail)) {
                return NextResponse.json(
                    { message: 'Un email valide est requis pour un compte administrateur ou permanent' },
                    { status: 400 }
                );
            }
            temporaryPassword = generatePassword();
            updateData.password = await bcrypt.hash(temporaryPassword, 10);
            updateData.passwordNeedsChange = true;
        }

        // Handle addresses separately
        if (body.addresses !== undefined) {
            await prisma.address.deleteMany({
                where: { userId: userId }
            });

            if (body.addresses.length > 0) {
                type UpdateDataWithAddresses = typeof updateData & {
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
                memberType: true,
                accessLevel: true,
                isActive: true,
                lastUpdated: true,
            },
        });

        // Deliver credentials for a freshly-provisioned login account. A failed send
        // leaves an account nobody can log into, so report 207 (not success).
        if (needsProvisioning && temporaryPassword) {
            const emailResult = await sendInvitationEmail({
                email: resultingEmail!,
                name: updatedUser.name,
                accessLevel: resultingAccessLevel as string,
                memberType: (updateData.memberType ?? existingUser.memberType) as string | undefined,
                temporaryPassword,
            });

            if (!emailResult.sent) {
                console.warn(`Provisioning email not sent (user ${userId}): ${emailResult.reason}`);
                return NextResponse.json(
                    {
                        message: "Personne mise à jour, mais l'envoi des identifiants a échoué. " +
                            "Utilisez « réinitialiser le mot de passe » pour les renvoyer.",
                        user: updatedUser,
                        emailSent: false,
                    },
                    { status: 207 }
                );
            }

            return NextResponse.json({
                message: 'Personne mise à jour avec succès. Les identifiants ont été envoyés par email.',
                user: updatedUser,
                emailSent: true,
            });
        }

        return NextResponse.json({
            message: 'Personne mise à jour avec succès',
            user: updatedUser,
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la mise à jour de la personne' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    revalidateAdmin();
    try {
        const { id } = await params;
        const userId = parseInt(id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { message: 'ID de personne invalide' },
                { status: 400 }
            );
        }

        // Auth: signed in + admin/super_admin only.
        const me = await getCurrentUser();
        if (!me) {
            return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        }
        if (!isAdmin(me.accessLevel)) {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }

        // findUnique is NOT soft-delete-filtered, so this resolves even a row
        // that was already soft-deleted (lets us answer idempotently).
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, deletedAt: true },
        });

        if (!existingUser) {
            return NextResponse.json(
                { message: 'Personne introuvable' },
                { status: 404 }
            );
        }

        if (existingUser.deletedAt) {
            return NextResponse.json({
                message: 'Cette personne est déjà supprimée.',
                deletedId: userId,
                softDelete: true,
                alreadyDeleted: true,
            });
        }

        // Refuse deletion while the person has active (in-progress) relations.
        // Once everything is closed, the soft-delete below is allowed.
        const blockers = await getUserDeletionBlockers(userId);
        if (blockers.total > 0) {
            return NextResponse.json(
                { message: describeBlockers(blockers), blockers },
                { status: 409 }
            );
        }

        // Soft delete: mark deletedAt. The global Prisma extension then hides
        // this user from all searches/lists/dropdowns, so they truly disappear,
        // while historical bills/orders keep their reference intact.
        await prisma.user.update({
            where: { id: userId },
            data: { deletedAt: new Date() },
            select: { id: true },
        });

        return NextResponse.json({
            message: 'Personne supprimée avec succès.',
            deletedId: userId,
            softDelete: true,
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la suppression de la personne' },
            { status: 500 }
        );
    }
}