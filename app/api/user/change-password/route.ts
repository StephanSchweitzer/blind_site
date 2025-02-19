// app/api/user/change-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(req: NextRequest) {
    try {
        // Get the current session
        const session = await getServerSession(authOptions);

        if (!session || !session.user?.email) {
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Parse request body
        const { currentPassword, newPassword } = await req.json();

        if (!currentPassword || !newPassword) {
            return NextResponse.json(
                { message: 'Les mots de passe actuels et nouveaux sont requis' },
                { status: 400 }
            );
        }

        // Get user from database with password
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true, password: true }
        });

        if (!user || !user.password) {
            return NextResponse.json(
                { message: 'Utilisateur non trouvé ou mot de passe non défini' },
                { status: 404 }
            );
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return NextResponse.json(
                { message: 'Mot de passe actuel incorrect' },
                { status: 400 }
            );
        }

        // Basic password strength validation
        if (newPassword.length < 8) {
            return NextResponse.json(
                { message: 'Le nouveau mot de passe doit contenir au moins 8 caractères' },
                { status: 400 }
            );
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update user password and reset the passwordNeedsChange flag
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedNewPassword,
                passwordNeedsChange: false
            }
        });

        return NextResponse.json({
            message: 'Mot de passe changé avec succès'
        });

    } catch (error) {
        console.error('Erreur lors du changement de mot de passe:', error);
        return NextResponse.json(
            { message: 'Erreur lors du changement de mot de passe' },
            { status: 500 }
        );
    }
}