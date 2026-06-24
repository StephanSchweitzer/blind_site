import { getServerSession } from "next-auth";
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { isSendableEmail } from '@/lib/email/sendEmail';
import { sendInvitationEmail } from '@/lib/email/sendInvitationEmail';
import { UserCreateInput } from '@/types/api/user.api';
import { AddressCreateInput } from '@/types/api/common.api';
import { MemberType, AccessLevel } from '@prisma/client';

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session) {
        return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
        });
    }

    if (session?.user.accessLevel !== 'admin' && session?.user.accessLevel !== 'super_admin') {
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
                memberType: true,
                accessLevel: true,
                isActive: true,
                lastUpdated: true,
                civility: { select: { name: true } },
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
    memberType?: MemberType;
    accessLevel?: AccessLevel;
    civilityId?: number | null;
    civilityOther?: string | null;
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ message: 'Non autorisé' }, { status: 401 });
        }

        if (session?.user.accessLevel !== 'admin' && session?.user.accessLevel !== 'super_admin') {
            return NextResponse.json({ message: 'Permissions insuffisantes' }, { status: 403 });
        }

        const body = await request.json() as UserCreateRequestBody;

        // Normalize the email once, up front: trim + lowercase so casing can never
        // create a second row that collides with an existing one.
        const normalizedEmail = body.email ? body.email.trim().toLowerCase() : null;

        // admin / super_admin are login-capable accounts; everyone else is a domain
        // record (auditeur, lecteur, bienfaiteur…) with no credentials.
        const isLoginAccount =
            body.accessLevel === 'admin' || body.accessLevel === 'super_admin';

        // Only super_admin can create admin or super_admin access levels
        if (isLoginAccount && session.user.accessLevel !== 'super_admin') {
            return NextResponse.json({
                message: 'Seuls les super administrateurs peuvent créer des membres permanents ou des administrateurs'
            }, { status: 403 });
        }

        // A login account must have a deliverable email — we have to send credentials.
        if (isLoginAccount && !normalizedEmail) {
            return NextResponse.json({ message: 'L\'email est requis pour les membres permanents' }, { status: 400 });
        }
        if (isLoginAccount && !isSendableEmail(normalizedEmail)) {
            return NextResponse.json({ message: 'Adresse email invalide pour un compte permanent' }, { status: 400 });
        }

        // Case-insensitive duplicate check (catches mixed-case legacy rows too)
        if (normalizedEmail) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email: { equals: normalizedEmail, mode: 'insensitive' },
                },
            });

            if (existingUser) {
                return NextResponse.json({ message: 'Cet email est déjà utilisé' }, { status: 400 });
            }
        }

        // Generate real, random credentials only for login accounts. No hardcoded
        // passwords: the temp password exists only here and in the emailed copy.
        let hashedPassword: string | null = null;
        let passwordNeedsChange = false;
        let temporaryPassword: string | null = null;

        if (isLoginAccount) {
            temporaryPassword = generatePassword();
            hashedPassword = await bcrypt.hash(temporaryPassword, 10);
            passwordNeedsChange = true;
        }

        // Derive legacy role from accessLevel for backward compatibility
        const derivedRole =
            body.accessLevel === 'super_admin' ? 'super_admin' :
                body.accessLevel === 'admin' ? 'admin' :
                    'user';

        const newUser = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                passwordNeedsChange: passwordNeedsChange,
                name: body.name || '',
                role: derivedRole, // legacy – kept for backward compatibility
                memberType: body.memberType ?? MemberType.auditeur,
                accessLevel: body.accessLevel ?? AccessLevel.member,
                civilityId: body.civilityId ?? null,
                civilityOther: body.civilityOther || null,
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
                memberType: true,
                accessLevel: true,
                isActive: true,
            },
        });

        // Login accounts get their credentials by email, via the same helper the
        // invite route uses. A failed send leaves an account nobody can log into, so
        // report 207 (not success) and point the admin at "reset password" to resend.
        if (isLoginAccount && temporaryPassword) {
            const emailResult = await sendInvitationEmail({
                email: normalizedEmail!,
                name: body.name,
                accessLevel: body.accessLevel as string,
                memberType: body.memberType as string | undefined,
                temporaryPassword,
            });

            if (!emailResult.sent) {
                console.warn(`Invitation email not sent (user ${newUser.id}): ${emailResult.reason}`);
                return NextResponse.json(
                    {
                        message: "Utilisateur créé, mais l'envoi des identifiants a échoué. " +
                            "Utilisez « réinitialiser le mot de passe » pour les renvoyer.",
                        user: newUser,
                        emailSent: false,
                    },
                    { status: 207 }
                );
            }
        }

        return NextResponse.json({
            message: 'Utilisateur créé avec succès',
            user: newUser,
            emailSent: isLoginAccount ? true : undefined,
        });
    } catch (error) {
        console.error('Error creating user:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la création de l\'utilisateur' },
            { status: 500 }
        );
    }
}