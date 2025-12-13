import { getServerSession } from "next-auth";
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { UserCreateInput } from '@/types/api/user.api';
import { AddressCreateInput } from '@/types/api/common.api';

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
        });
    }

    if (session?.user.role !== 'admin' && session?.user.role !== 'super_admin') {
        return new NextResponse(JSON.stringify({ error: "insufficient authorization" }), {
            status: 403,
        });
    }

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                lastUpdated: true,
            },
            orderBy: {
                id: 'desc',
            },
        });

        return NextResponse.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

interface UserCreateRequestBody extends Omit<UserCreateInput, 'password'> {
    addresses?: Omit<AddressCreateInput, 'userId'>[];
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ message: 'Non autorisé' }, { status: 401 });
        }

        if (session?.user.role !== 'admin' && session?.user.role !== 'super_admin') {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }

        const body = await request.json() as UserCreateRequestBody;

        // Only super_admin can create admin, lecteur (admin), or super_admin roles
        if ((body.role === 'admin' || body.role === 'super_admin') && session.user.role !== 'super_admin') {
            return NextResponse.json({
                message: 'Seuls les super administrateurs peuvent créer des lecteurs ou des administrateurs'
            }, { status: 403 });
        }

        // Email is required for admin and super_admin roles
        if ((body.role === 'admin' || body.role === 'super_admin') && !body.email) {
            return NextResponse.json({ message: 'L\'email est requis pour les lecteurs' }, { status: 400 });
        }

        // Check for existing email only if email is provided
        if (body.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email: body.email },
            });

            if (existingUser) {
                return NextResponse.json({ message: 'Cet email est déjà utilisé' }, { status: 400 });
            }
        }

        // Create password only for admin and super_admin roles
        let hashedPassword: string | null = null;
        let passwordNeedsChange = false;

        if (body.role === 'admin' || body.role === 'super_admin') {
            hashedPassword = await bcrypt.hash('temporaryPassword123', 10);
            passwordNeedsChange = true;
        }

        const newUser = await prisma.user.create({
            data: {
                email: body.email || null,
                password: hashedPassword,
                passwordNeedsChange: passwordNeedsChange,
                name: body.name || '',
                role: body.role || 'user',
                firstName: body.firstName || null,
                lastName: body.lastName || null,
                homePhone: body.homePhone || null,
                cellPhone: body.cellPhone || null,
                gestconteNotes: body.gestconteNotes || null,
                gestconteId: body.gestconteId || null,
                nonProfitAffiliation: body.nonProfitAffiliation || null,
                isActive: true,
                preferredDeliveryMethod: body.preferredDeliveryMethod || null,
                paymentThreshold: body.paymentThreshold ? parseFloat(String(body.paymentThreshold)) : 21.00,
                currentBalance: body.currentBalance ? parseFloat(String(body.currentBalance)) : 0.00,
                preferredDistributionMethod: body.preferredDistributionMethod || null,
                isAvailable: body.isAvailable ?? true,
                availabilityNotes: body.availabilityNotes || null,
                specialization: body.specialization || null,
                maxConcurrentAssignments: body.maxConcurrentAssignments || 3,
                notes: body.notes || null,
                addresses: body.addresses && body.addresses.length > 0 ? {
                    create: body.addresses.map((addr) => ({
                        addressLine1: addr.addressLine1 || null,
                        addressSupplement: addr.addressSupplement || null,
                        city: addr.city || null,
                        postalCode: addr.postalCode || null,
                        stateProvince: addr.stateProvince || null,
                        country: addr.country || 'France',
                        isDefault: addr.isDefault || false,
                    }))
                } : undefined,
            },
            select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
            },
        });

        return NextResponse.json({
            message: 'Utilisateur créé avec succès',
            user: newUser,
        });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la création de l\'utilisateur' },
            { status: 500 }
        );
    }
}