// app/api/user/invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { revalidateAdmin } from '@/lib/revalidate-admin';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { generatePassword } from '@/lib/utils';
import { isSendableEmail } from '@/lib/email/sendEmail';
import { sendInvitationEmail } from '@/lib/email/sendInvitationEmail';

export async function OPTIONS() {
    return NextResponse.json({}, {
        status: 200,
        headers: {
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function POST(req: NextRequest) {
    revalidateAdmin();
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ message: 'Non authentifié' }, { status: 401 });
        }

        const currentUser = await prisma.user.findUnique({
            where: { email: session.user?.email as string },
        });

        if (!currentUser || currentUser.accessLevel !== 'super_admin') {
            return NextResponse.json(
                { message: 'Permission refusée. Seuls les super administrateurs peuvent inviter des personnes.' },
                { status: 403 }
            );
        }

        const { email, name, accessLevel, memberType } = await req.json();

        if (!email) {
            return NextResponse.json({ message: 'L\'email est requis' }, { status: 400 });
        }

        // Normalize like POST /api/user, and fail fast on a malformed address so we
        // never create an account we can't deliver credentials to (bounce + orphan).
        const normalizedEmail = email.trim().toLowerCase();
        if (!isSendableEmail(normalizedEmail)) {
            return NextResponse.json({ message: 'Adresse email invalide' }, { status: 400 });
        }

        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
        });

        if (existingUser) {
            return NextResponse.json(
                { message: 'Une personne avec cet email existe déjà' },
                { status: 409 }
            );
        }

        const temporaryPassword = generatePassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                email: normalizedEmail,
                name: name || null,
                role: accessLevel || 'user',
                accessLevel: accessLevel || 'user',
                memberType: memberType || null,
                password: hashedPassword,
                passwordNeedsChange: true,
            },
        });

        const result = await sendInvitationEmail({
            email: normalizedEmail,
            name,
            accessLevel: accessLevel || 'user',
            memberType,
            temporaryPassword,
        });

        // The email carries the only copy of the temp password. If it didn't go out,
        // tell the admin (207) — they can use "reset password" to regenerate/resend.
        if (!result.sent) {
            console.warn(`Invitation email not sent (user ${newUser.id}): ${result.reason}`);
            return NextResponse.json(
                {
                    message: "La personne a été créée mais l'envoi de l'invitation a échoué. " +
                        "Utilisez « réinitialiser le mot de passe » pour renvoyer ses identifiants.",
                    userId: newUser.id,
                    emailSent: false,
                },
                { status: 207 }
            );
        }

        return NextResponse.json(
            { message: 'Personne invitée avec succès', userId: newUser.id, emailSent: true },
            { status: 201 }
        );
    } catch (error) {
        console.error('Erreur lors de l\'invitation d\'un utilisateur:', error);
        return NextResponse.json(
            { message: 'Erreur lors de l\'invitation de la personne' },
            { status: 500 }
        );
    }
}