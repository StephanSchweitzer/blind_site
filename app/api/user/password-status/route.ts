// app/api/user/password-status/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        // Get the current session
        const session = await getServerSession(authOptions);

        if (!session || !session.user?.email) {
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Get user from database
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { passwordNeedsChange: true }
        });

        if (!user) {
            return NextResponse.json(
                { message: 'Utilisateur non trouvé' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            needsChange: user.passwordNeedsChange || false
        });

    } catch (error) {
        console.error('Erreur lors de la vérification du statut du mot de passe:', error);
        return NextResponse.json(
            { message: 'Erreur lors de la vérification du statut du mot de passe' },
            { status: 500 }
        );
    }
}