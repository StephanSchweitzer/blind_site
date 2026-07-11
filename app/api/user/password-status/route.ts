// app/api/user/password-status/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/guards';

export const GET = withAuth(async (_req, { me }) => {
    try {
        if (!me.email) {
            return NextResponse.json(
                { message: 'Non authentifié' },
                { status: 401 }
            );
        }

        // Get user from database
        const user = await prisma.user.findUnique({
            where: { email: me.email },
            select: { passwordNeedsChange: true }
        });

        if (!user) {
            return NextResponse.json(
                { message: 'Personne non trouvée' },
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
});